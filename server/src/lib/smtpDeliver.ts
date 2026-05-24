import nodemailer from "nodemailer";

function smtpEnv(key: "HOST" | "PORT" | "SECURE" | "USER" | "PASS" | "FROM"): string {
  const marketplace = process.env[`MARKETPLACE_SMTP_${key}` as keyof NodeJS.ProcessEnv];
  const reset = process.env[`PASSWORD_RESET_SMTP_${key}` as keyof NodeJS.ProcessEnv];
  return String(marketplace ?? reset ?? "").trim();
}

export function isSmtpDeliverConfigured(): boolean {
  return !!(smtpEnv("HOST") && smtpEnv("USER") && smtpEnv("PASS"));
}

export function normalizeEmailRecipients(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  const out: string[] = [];
  for (const raw of arr) {
    const t = String(raw ?? "").trim();
    if (!t || !t.includes("@")) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out;
}

/** Envío SMTP (Workspace / Gmail) compartido: contacto, consultas y avisos a ventas. */
export async function sendSmtpDeliverEmail(args: {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  if (!isSmtpDeliverConfigured()) {
    throw new Error("SMTP no configurado (PASSWORD_RESET_SMTP_* o MARKETPLACE_SMTP_*).");
  }
  const recipients = normalizeEmailRecipients(args.to);
  if (recipients.length === 0) {
    throw new Error("Destinatario SMTP inválido.");
  }

  const host = smtpEnv("HOST");
  const user = smtpEnv("USER");
  const pass = smtpEnv("PASS");
  const rawPort = smtpEnv("PORT") || "587";
  const parsedPort = Number.parseInt(rawPort, 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  const secureRaw = smtpEnv("SECURE").toLowerCase();
  const secure = secureRaw === "true" || secureRaw === "1" || port === 465;
  const from =
    smtpEnv("FROM") ||
    String(process.env.RESEND_FROM_EMAIL || "").trim() ||
    user;

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject: args.subject,
    text: args.text,
    html: args.html,
    ...(args.replyTo?.trim() ? { replyTo: args.replyTo.trim() } : {}),
  });
}
