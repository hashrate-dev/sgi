# Vercel + Supabase (front y API en el mismo dominio)

El frontend y la API corren en Vercel. La API se conecta a **Supabase** (PostgreSQL). No se usa Render.

## 1. Configuración en Vercel

En [vercel.com](https://vercel.com) → tu proyecto → **Settings**:

| Opción | Valor |
|--------|--------|
| **Root Directory** | Raíz del repo (donde están `client`, `server`, `api`) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

## 2. Variables de entorno

En **Settings → Environment Variables** agregá las mismas claves para **Production** y, si usás previews, **Preview** (y **Development** solo si corrés `vercel dev` con secretos).

| Nombre | Valor | Obligatorio |
|--------|--------|-------------|
| `SUPABASE_DATABASE_URL` | Connection string de Supabase. Ej: `postgresql://postgres:TU_PASSWORD@db.xxx.supabase.co:5432/postgres` | **Sí** |
| `JWT_SECRET` | String largo (mín. 16 caracteres) para firmar el JWT del login | **Sí** |
| `RESEND_API_KEY` | API key `re_…` de [Resend](https://resend.com/api-keys) | **Sí** si querés correo (marketplace + reset) |
| `RESEND_FROM_EMAIL` | Remitente para avisos marketplace, ej. `HashrateSpace <noreply@hashrate.space>` (dominio **verificado** en Resend) | Recomendado |
| `PASSWORD_RESET_FROM_EMAIL` | Remitente del mail de reset; mismo dominio verificado en Resend, ej. `HashrateSpace <noreply@hashrate.space>`. Si no está, se usa `RESEND_FROM_EMAIL` / prueba `onboarding@resend.dev` | Recomendado |
| `MARKETPLACE_NOTIFY_EMAIL_TO` | Destino de avisos de órdenes marketplace (default en código: `sales@hashrate.space`) | Opcional |
| `APP_PUBLIC_URL` | URL pública del front para links en mails (ej. `https://app.hashrate.space`). Si falta, el servidor intenta deducirla del request | Opcional |
| `FRONTEND_ORIGIN` | Alternativa a `APP_PUBLIC_URL` (misma idea: base del enlace de reset) | Opcional |

**Reset de contraseña y Resend:** en [Resend → Domains](https://resend.com/domains) tené `hashrate.space` (o el dominio que uses) en estado **Verified** y usá `From` con ese dominio. Sin dominio verificado, Resend en prueba suele no entregar a correos arbitrarios.

**SMTP opcional del reset** (solo si configurás envío alternativo): `PASSWORD_RESET_SMTP_HOST`, `PASSWORD_RESET_SMTP_PORT`, `PASSWORD_RESET_SMTP_SECURE`, `PASSWORD_RESET_SMTP_USER`, `PASSWORD_RESET_SMTP_PASS`, `PASSWORD_RESET_SMTP_FROM` — ver `.env.resend.local.example`.

Obtener `SUPABASE_DATABASE_URL`: Supabase Dashboard → Project Settings → Database → Connection string → URI.

### Subir Resend desde tu PC (mismo `.env` que en local)

1. Tené en la **raíz** del repo `RESEND_API_KEY` (y opcional `RESEND_FROM_EMAIL`) en `.env` o en **`.env.resend.local`** (`npm run resend:init` crea el archivo desde el example).
2. Creá un token en [vercel.com/account/tokens](https://vercel.com/account/tokens).
3. En PowerShell (desde la raíz del repo):

```powershell
$env:VERCEL_TOKEN="(pegá aquí el token que creás en vercel.com/account/tokens; no lo subas al repo)"
npm run vercel:env:resend
```

El script usa el mismo `VERCEL_PROJECT_ID` / team que `scripts/deploy-vercel.cjs` (podés sobreescribir con `VERCEL_PROJECT_ID` y `VERCEL_TEAM_ID` o `VERCEL_ORG_ID`).

4. **Redeploy** en Vercel (Deployments → … → Redeploy) para que la API serverless cargue las variables nuevas.

Si preferís no usar el script: en el dashboard → **Settings → Environment Variables** agregá manualmente las mismas claves para **Production** y **Preview**.

## 3. Schema en Supabase

Ejecutá una vez el schema en Supabase: **SQL Editor** → New query → pegar el contenido de `server/src/db/schema-supabase.sql` → Run.

## 4. Deploy

- **Deployments** → Redeploy, o push a `main` si tenés deploy automático.
- El build genera `dist` (front) y `server/dist` (API). La carpeta `api/` expone la API como función serverless.

## 5. Probar

Abrí `https://tu-proyecto.vercel.app/login`:

- **jv@hashrate.space** / **admin123**
- **fb@hashrate.space** / **123456**

Si falla: revisá los logs del deploy y que `SUPABASE_DATABASE_URL` y `JWT_SECRET` estén configuradas.
