# Fix login en Vercel (sgi-two.vercel.app)

## Cambios realizados

Se reestructuró el proyecto para que funcione con **Root Directory = client** en Vercel:

1. **client/api/[[...path]].js** – Handler de la API dentro de client (se despliega con Root=client)
2. **build:vercel** – Compila server, copia a client/server/dist, compila client
3. **client/vercel.json** – buildCommand: `npm run build:vercel`, installCommand desde raíz

## Configuración en Vercel

1. **Settings → General → Root Directory:** `client` (debe estar en `client`)
2. **Environment Variables** (Production):
   - `SUPABASE_DATABASE_URL` = URL del pooler de Supabase (ej. `postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres`)
   - `JWT_SECRET` = secreto para JWT (ej. `hashrate-jwt-secreto-produccion-2024`)

## Desplegar

```bash
git add -A
git commit -m "fix: API dentro de client para Root Directory = client"
git push
```

Después del deploy, probar: https://sgi-two.vercel.app/login
