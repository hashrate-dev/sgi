# Conectar Vercel con Supabase como backend (sin Render)

Para que **https://sgi-client.vercel.app** use **solo Supabase** (nada de Render), el backend tiene que correr en Vercel y conectarse a Supabase.

## 1. Configuración del proyecto en Vercel

En [vercel.com](https://vercel.com) → tu proyecto → **Settings**:

| Opción | Valor |
|--------|--------|
| **Root Directory** | Dejá en blanco o `./` (raíz del repo, donde están `client`, `server`, `api`) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

Si Root Directory está en `client`, **cambialo a la raíz**. Si solo está el front, la API no se despliega y el login no puede usar Supabase.

## 2. Variables de entorno en Vercel

En **Settings → Environment Variables** agregá (para Production y Preview si quieres):

| Nombre | Valor | Obligatorio |
|--------|--------|-------------|
| `SUPABASE_DATABASE_URL` | La connection string de Supabase (Postgres). En Supabase: Project Settings → Database → Connection string → URI. Reemplazá `[YOUR-PASSWORD]` por tu contraseña. Sin barra final. | Sí |
| `JWT_SECRET` | Una frase o string largo de al menos 16 caracteres (para firmar el login). | Sí |

No hace falta `VITE_API_URL`: el front llama a `/api/*` en el mismo dominio.

## 3. Redeploy

1. **Deployments** → menú (⋮) del último deploy → **Redeploy**.
2. O hacé un **push a tu rama** (ej. `main`) si tenés deploy automático.

Esperá a que termine el build. El build debe ejecutar `npm run build` en la raíz (genera `dist` y `server/dist`). La carpeta `api/` hace que Vercel cree funciones serverless que usan `server/dist` y las variables de entorno.

## 4. Probar el login

Abrí **https://sgi-client.vercel.app/login** (mejor en incógnito o borrando datos del sitio).

- Usuario: **jv@hashrate.space** — Contraseña: **admin123**
- O: **fb@hashrate.space** — **123456**

Si falla, revisá en **Deployments** los logs del último deploy: que el build termine bien y que no falte `server/dist`. Y en **Functions** (o logs de la función) que no haya error de conexión a Supabase (ej. `SUPABASE_DATABASE_URL` mal definida).

## Resumen

- **Render:** no se usa. No hace falta tener nada en dashboard.render.com.
- **Backend:** corre en Vercel (carpeta `api/`, Express en serverless) y se conecta a **Supabase** con `SUPABASE_DATABASE_URL`.
- **Base de datos:** solo Supabase (misma que en local). Las tablas se crean ejecutando `server/supabase/schema.sql` en el SQL Editor de Supabase (una sola vez).
