import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { rowKeysToLowercase } from "../lib/pgRowLowercase.js";

export const hostingFxOperationsRouter = Router();
let hostingFxSchemaEnsured = false;

async function ensureHostingFxSchema(): Promise<void> {
  if (hostingFxSchemaEnsured) return;
  await db.prepare("ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS operation_amount DOUBLE PRECISION NOT NULL DEFAULT 0").run();
  await db.prepare("ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS bank_fee_amount DOUBLE PRECISION NOT NULL DEFAULT 0").run();
  await db.prepare("ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS delivery_method TEXT NOT NULL DEFAULT 'usd_to_bank'").run();
  await db.prepare("ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS account_holder_name TEXT NOT NULL DEFAULT ''").run();
  await db.prepare("ALTER TABLE hosting_fx_operations ADD COLUMN IF NOT EXISTS ticket_code TEXT").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_hosting_fx_ticket_code_unique ON hosting_fx_operations(ticket_code)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS hosting_fx_ticket_seq (id INTEGER PRIMARY KEY, next_num BIGINT NOT NULL)").run();
  await db.prepare("INSERT INTO hosting_fx_ticket_seq (id, next_num) VALUES (1, 100) ON CONFLICT (id) DO NOTHING").run();
  await migrateOpTicketCodesToTc();
  await backfillHostingFxTicketCodes();
  await syncHostingFxTicketSeqFromDb();
  hostingFxSchemaEnsured = true;
}

const TICKET_CODE_PREFIX = "TC";

function formatHostingFxTicketCode(n: number): string {
  return `${TICKET_CODE_PREFIX}${String(Math.max(0, Math.trunc(n))).padStart(4, "0")}`;
}

async function getNextHostingFxTicketCode(): Promise<string> {
  const row = (await db
    .prepare("UPDATE hosting_fx_ticket_seq SET next_num = next_num + 1 WHERE id = 1 RETURNING next_num - 1 AS ticket_num")
    .get()) as { ticket_num?: number | string } | undefined;
  const n = Number(row?.ticket_num ?? 100);
  return formatHostingFxTicketCode(Number.isFinite(n) ? n : 100);
}

async function migrateOpTicketCodesToTc(): Promise<void> {
  try {
    await db.prepare("UPDATE hosting_fx_operations SET ticket_code = 'TC' || substr(ticket_code, 3) WHERE ticket_code LIKE 'OP%'").run();
  } catch {
    /* si la columna aún no existe, ensureHostingFxSchema reintenta otra vuelta */
  }
}

/** Alinea el contador con el máximo TC**** ya guardado. */
async function syncHostingFxTicketSeqFromDb(): Promise<void> {
  const withCode = (await db
    .prepare(
      "SELECT COALESCE(MAX(CAST(substr(ticket_code, 3) AS BIGINT)), 99) AS max_num FROM hosting_fx_operations WHERE ticket_code LIKE 'TC%'"
    )
    .get()) as { max_num?: number | string } | undefined;
  const currentMax = Number(withCode?.max_num ?? 99);
  if (!Number.isFinite(currentMax)) return;
  const next = Math.max(100, currentMax + 1);
  await db
    .prepare("UPDATE hosting_fx_ticket_seq SET next_num = CASE WHEN next_num < ? THEN ? ELSE next_num END WHERE id = 1")
    .run(next, next);
}

async function backfillHostingFxTicketCodes(): Promise<void> {
  const withCode = (await db
    .prepare(
      "SELECT COALESCE(MAX(CAST(substr(ticket_code, 3) AS BIGINT)), 99) AS max_num FROM hosting_fx_operations WHERE ticket_code LIKE 'TC%' OR ticket_code LIKE 'OP%'"
    )
    .get()) as { max_num?: number | string } | undefined;
  const currentMax = Number(withCode?.max_num ?? 99);
  const missing = (await db
    .prepare("SELECT id FROM hosting_fx_operations WHERE ticket_code IS NULL OR TRIM(ticket_code) = '' ORDER BY id ASC")
    .all()) as Array<{ id: number }>;
  if (!missing.length) return;
  let next = Number.isFinite(currentMax) ? Math.max(100, currentMax + 1) : 100;
  for (const row of missing) {
    await db.prepare("UPDATE hosting_fx_operations SET ticket_code = ? WHERE id = ?").run(formatHostingFxTicketCode(next), row.id);
    next += 1;
  }
  await db
    .prepare("UPDATE hosting_fx_ticket_seq SET next_num = CASE WHEN next_num < ? THEN ? ELSE next_num END WHERE id = 1")
    .run(next, next);
}

const FxUsdtSideSchema = z.enum(["buy_usdt", "sell_usdt"]);
const FxDeliveryMethodSchema = z.enum(["usd_to_bank", "usdt_to_hrs_binance"]);

const FxOperationCreateSchema = z
  .object({
    clientId: z.coerce.number().int().positive(),
    operationDate: z.string().min(1).max(40).trim(),
    operationAmount: z.coerce.number().min(0),
    hrsCommissionPct: z.coerce.number().min(0).max(100),
    bankFeeAmount: z.coerce.number().min(0),
    deliveryMethod: FxDeliveryMethodSchema,
    bankName: z.string().max(160).trim(),
    accountNumber: z.string().max(120).trim(),
    currency: z.string().max(24).trim(),
    bankBranch: z.string().max(160).trim(),
    accountHolderName: z.string().max(200).trim(),
    usdtSide: FxUsdtSideSchema,
    notes: z.string().max(1000).trim().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.usdtSide === "buy_usdt" && data.deliveryMethod !== "usdt_to_hrs_binance") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["deliveryMethod"], message: "Compra de USDT usa USDT a Binance." });
    }
    if (data.deliveryMethod === "usd_to_bank") {
      if (!data.bankName.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankName"] });
      if (!data.accountNumber.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountNumber"] });
      if (!data.currency.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["currency"] });
      if (!data.bankBranch.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankBranch"] });
      if (!data.accountHolderName.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountHolderName"] });
    }
  });

const FxOperationUpdateSchema = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  operationDate: z.string().min(1).max(40).trim().optional(),
  operationAmount: z.coerce.number().min(0).optional(),
  hrsCommissionPct: z.coerce.number().min(0).max(100).optional(),
  bankFeeAmount: z.coerce.number().min(0).optional(),
  deliveryMethod: FxDeliveryMethodSchema.optional(),
  bankName: z.string().min(1).max(160).trim().optional(),
  accountNumber: z.string().min(1).max(120).trim().optional(),
  currency: z.string().min(1).max(24).trim().optional(),
  bankBranch: z.string().min(1).max(160).trim().optional(),
  accountHolderName: z.string().min(1).max(200).trim().optional(),
  usdtSide: FxUsdtSideSchema.optional(),
  notes: z.string().max(1000).trim().optional(),
});

type FxRow = {
  id: number;
  ticket_code?: string | null;
  client_id: number;
  operation_date: string;
  operation_amount: number;
  operation_type: "usdt_to_usd" | "usd_to_usdt";
  hrs_commission_pct: number;
  bank_fee_amount: number;
  delivery_method: "usd_to_bank" | "usdt_to_hrs_binance";
  client_total_payment: number;
  bank_name: string;
  account_number: string;
  currency: string;
  bank_branch: string;
  account_holder_name: string;
  usdt_side: "buy_usdt" | "sell_usdt";
  notes?: string | null;
  created_at: string;
  updated_at: string;
  client_code?: string | null;
  client_name?: string | null;
  client_name2?: string | null;
};

function mapFxRow(raw: Record<string, unknown>): Record<string, unknown> {
  const r = rowKeysToLowercase(raw);
  return {
    id: Number(r.id ?? 0),
    ticketCode: r.ticket_code == null ? "" : String(r.ticket_code),
    clientId: Number(r.client_id ?? 0),
    operationDate: String(r.operation_date ?? ""),
    operationAmount: Number(r.operation_amount ?? 0),
    operationType: String(r.operation_type ?? ""),
    hrsCommissionPct: Number(r.hrs_commission_pct ?? 0),
    bankFeeAmount: Number(r.bank_fee_amount ?? 0),
    deliveryMethod: String(r.delivery_method ?? ""),
    clientTotalPayment: Number(r.client_total_payment ?? 0),
    bankName: String(r.bank_name ?? ""),
    accountNumber: String(r.account_number ?? ""),
    currency: String(r.currency ?? ""),
    bankBranch: String(r.bank_branch ?? ""),
    accountHolderName: String(r.account_holder_name ?? ""),
    usdtSide: String(r.usdt_side ?? ""),
    notes: r.notes == null ? "" : String(r.notes),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    clientCode: r.client_code == null ? "" : String(r.client_code),
    clientName: r.client_name == null ? "" : String(r.client_name),
    clientLastName: r.client_name2 == null ? "" : String(r.client_name2),
  };
}

hostingFxOperationsRouter.get(
  "/hosting/fx-operations",
  requireRole("admin_a", "admin_b", "operador", "lector"),
  async (_req, res) => {
    await ensureHostingFxSchema();
    const rows = (await db
      .prepare(
        `SELECT o.id, o.ticket_code, o.client_id, o.operation_date, o.operation_type, o.hrs_commission_pct, o.bank_fee_amount, o.delivery_method, o.client_total_payment,
                o.operation_amount,
                o.bank_name, o.account_number, o.currency, o.bank_branch, o.account_holder_name, o.usdt_side, o.notes, o.created_at, o.updated_at,
                c.code AS client_code, c.name AS client_name, c.name2 AS client_name2
         FROM hosting_fx_operations o
         JOIN clients c ON c.id = o.client_id
         ORDER BY o.operation_date DESC, o.id DESC`
      )
      .all()) as FxRow[];
    res.json({ operations: rows.map((x) => mapFxRow(x as unknown as Record<string, unknown>)) });
  }
);

hostingFxOperationsRouter.post(
  "/hosting/fx-operations",
  requireRole("admin_a", "admin_b", "operador"),
  async (req, res) => {
    await ensureHostingFxSchema();
    const parsed = FxOperationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para registrar la operación." } });
    }
    const d = parsed.data;
    const operationType: "usdt_to_usd" | "usd_to_usdt" = d.usdtSide === "buy_usdt" ? "usd_to_usdt" : "usdt_to_usd";
    const transferAmount = Math.max(0, d.operationAmount - (d.operationAmount * d.hrsCommissionPct) / 100);
    const client = (await db.prepare("SELECT id FROM clients WHERE id = ?").get(d.clientId)) as { id: number } | undefined;
    if (!client) return res.status(404).json({ error: { message: "Cliente de hosting no encontrado." } });

    const now = new Date().toISOString();
    const ticketCode = await getNextHostingFxTicketCode();
    await db
      .prepare(
        `INSERT INTO hosting_fx_operations (
          client_id, operation_date, operation_amount, operation_type, hrs_commission_pct, bank_fee_amount, delivery_method, client_total_payment,
          bank_name, account_number, currency, bank_branch, account_holder_name, usdt_side, notes, created_at, updated_at, ticket_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        d.clientId,
        d.operationDate,
        d.operationAmount,
        operationType,
        d.hrsCommissionPct,
        d.bankFeeAmount,
        d.deliveryMethod,
        transferAmount,
        d.bankName,
        d.accountNumber,
        d.currency,
        d.bankBranch,
        d.accountHolderName,
        d.usdtSide,
        d.notes ?? null,
        now,
        now,
        ticketCode
      );
    res.status(201).json({ ok: true });
  }
);

hostingFxOperationsRouter.put(
  "/hosting/fx-operations/:id",
  requireRole("admin_a", "admin_b", "operador"),
  async (req, res) => {
    await ensureHostingFxSchema();
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: { message: "ID inválido." } });
    const parsed = FxOperationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { message: "Datos inválidos para actualizar la operación." } });
    }
    const d = parsed.data;
    const exists = (await db.prepare("SELECT id FROM hosting_fx_operations WHERE id = ?").get(id)) as { id: number } | undefined;
    if (!exists) return res.status(404).json({ error: { message: "Operación no encontrada." } });
    if (d.clientId != null) {
      const client = (await db.prepare("SELECT id FROM clients WHERE id = ?").get(d.clientId)) as { id: number } | undefined;
      if (!client) return res.status(404).json({ error: { message: "Cliente de hosting no encontrado." } });
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      fields.push(sql);
      values.push(value);
    };
    const nextUsdtSide = d.usdtSide;
    const nextOperationType: "usdt_to_usd" | "usd_to_usdt" | null =
      nextUsdtSide != null ? (nextUsdtSide === "buy_usdt" ? "usd_to_usdt" : "usdt_to_usd") : null;
    if (d.clientId != null) push("client_id = ?", d.clientId);
    if (d.operationDate != null) push("operation_date = ?", d.operationDate);
    if (d.operationAmount != null) push("operation_amount = ?", d.operationAmount);
    if (d.hrsCommissionPct != null) push("hrs_commission_pct = ?", d.hrsCommissionPct);
    if (d.bankFeeAmount != null) push("bank_fee_amount = ?", d.bankFeeAmount);
    if (d.deliveryMethod != null) push("delivery_method = ?", d.deliveryMethod);
    if (d.bankName != null) push("bank_name = ?", d.bankName);
    if (d.accountNumber != null) push("account_number = ?", d.accountNumber);
    if (d.currency != null) push("currency = ?", d.currency);
    if (d.bankBranch != null) push("bank_branch = ?", d.bankBranch);
    if (d.accountHolderName != null) push("account_holder_name = ?", d.accountHolderName);
    if (d.usdtSide != null) push("usdt_side = ?", d.usdtSide);
    if (nextOperationType != null) push("operation_type = ?", nextOperationType);
    if (d.notes != null) push("notes = ?", d.notes);
    if (d.operationAmount != null || d.hrsCommissionPct != null) {
      const current = (await db
        .prepare("SELECT operation_amount, hrs_commission_pct FROM hosting_fx_operations WHERE id = ?")
        .get(id)) as { operation_amount?: number; hrs_commission_pct?: number } | undefined;
      const opAmount = d.operationAmount ?? Number(current?.operation_amount ?? 0);
      const commPct = d.hrsCommissionPct ?? Number(current?.hrs_commission_pct ?? 0);
      const transferAmount = Math.max(0, opAmount - (opAmount * commPct) / 100);
      push("client_total_payment = ?", transferAmount);
    }
    push("updated_at = ?", new Date().toISOString());
    if (fields.length === 0) return res.json({ ok: true });
    values.push(id);
    await db.prepare(`UPDATE hosting_fx_operations SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    res.json({ ok: true });
  }
);

hostingFxOperationsRouter.delete(
  "/hosting/fx-operations/:id",
  requireRole("admin_a", "admin_b"),
  async (req, res) => {
    await ensureHostingFxSchema();
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: { message: "ID inválido." } });
    await db.prepare("DELETE FROM hosting_fx_operations WHERE id = ?").run(id);
    res.json({ ok: true });
  }
);
