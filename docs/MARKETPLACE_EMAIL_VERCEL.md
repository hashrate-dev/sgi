# Correo del marketplace → sales@hashrate.space (Vercel)

El formulario **«Email us»** en `/equipment` llama a `POST /api/marketplace/asic-inquiry`. El servidor envía a **sales@hashrate.space** (o `MARKETPLACE_CONTACT_EMAIL_TO`).

Si ves **403: domain is not verified**, Resend rechazó el **remitente** (`noreply@mail.hashrate.space` o `noreply@hashrate.space`). Hay que arreglar **una** de estas dos vías.

## Opción A — Verificar dominio en Resend (recomendado)

1. Entrá a [resend.com/domains](https://resend.com/domains) → **Add Domain**.
2. Agregá **`mail.hashrate.space`** (o `hashrate.space` si preferís el apex).
3. Copiá los registros DNS (SPF, DKIM, etc.) en el panel de **hashrate.space** (Cloudflare, etc.).
4. Esperá estado **Verified** en Resend.
5. En **Vercel** → proyecto → **Settings** → **Environment Variables** (Production):
   - `RESEND_API_KEY` = clave `re_…` de [resend.com/api-keys](https://resend.com/api-keys)
   - `RESEND_FROM_EMAIL` = `Hashrate Space <noreply@mail.hashrate.space>` (mismo dominio verificado)
   - `MARKETPLACE_CONTACT_EMAIL_TO` = `sales@hashrate.space`
6. **Redeploy** del último deployment.

Desde la raíz del repo (con token Vercel):

```bash
npm run vercel:env:resend
```

## Opción B — SMTP Google Workspace (sin depender de Resend)

Si tenés **sales@hashrate.space** en Google Workspace:

1. Creá una **contraseña de aplicación** para la cuenta que envía (o usá la de `sales@`).
2. En Vercel, definí:

| Variable | Ejemplo |
|----------|---------|
| `PASSWORD_RESET_SMTP_HOST` | `smtp.gmail.com` |
| `PASSWORD_RESET_SMTP_PORT` | `587` |
| `PASSWORD_RESET_SMTP_SECURE` | `false` |
| `PASSWORD_RESET_SMTP_USER` | `sales@hashrate.space` |
| `PASSWORD_RESET_SMTP_PASS` | contraseña de aplicación |
| `PASSWORD_RESET_SMTP_FROM` | `Hashrate Space <sales@hashrate.space>` |
| `MARKETPLACE_SALES_SMTP_FIRST` | `1` |
| `MARKETPLACE_CONTACT_EMAIL_TO` | `sales@hashrate.space` |

3. **Redeploy**.

```bash
npm run vercel:env:marketplace-email
```

El servidor intentará **SMTP primero** y Resend como respaldo.

## Comprobar

Tras el redeploy, enviá un correo de prueba desde el carrito en [hashrate.space/equipment](https://hashrate.space/equipment). Debería llegar a **sales@hashrate.space** (revisá spam si no aparece en bandeja de entrada).
