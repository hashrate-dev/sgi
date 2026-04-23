/**
 * Reescribe un recibo a formato de liquidación (para PDF coherente con Facturación hosting).
 * Uso (desde carpeta `server/`):
 *   npx tsx src/scripts/rebuildReciboSettlement.ts RC001053
 *   npx tsx src/scripts/rebuildReciboSettlement.ts RC001053 asic
 */
import { getDb, initDb } from "../db.js";
import { rebuildReciboSettlementByNumber } from "../lib/rebuildReciboSettlement.js";

async function main(): Promise<void> {
  const number = process.argv[2] || "RC001053";
  const source = process.argv[3] === "asic" ? "asic" : "hosting";
  await initDb();
  const result = await rebuildReciboSettlementByNumber(getDb, number, { source });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
