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

En **Settings → Environment Variables** agregá:

| Nombre | Valor | Obligatorio |
|--------|--------|-------------|
| `SUPABASE_DATABASE_URL` | Connection string de Supabase. Ej: `postgresql://postgres:TU_PASSWORD@db.xxx.supabase.co:5432/postgres` | **Sí** |
| `JWT_SECRET` | String largo (mín. 16 caracteres) para firmar el JWT del login | **Sí** |

Obtener `SUPABASE_DATABASE_URL`: Supabase Dashboard → Project Settings → Database → Connection string → URI.

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
