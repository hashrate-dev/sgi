# Troubleshooting: API no responde en Vercel

## 1. Probar si la API está desplegada

Abrí en el navegador: **https://sgi-two.vercel.app/api/health**

- Si ves `{"ok":true,"t":1234567890}` → La API está desplegada. El problema es el login (DB, variables, etc.).
- Si ves 404 o error → La API no se está desplegando. Ver paso 2.

## 2. Verificar Root Directory en Vercel

1. Entrá a [vercel.com/dashboard](https://vercel.com/dashboard)
2. Abrí el proyecto **sgi-two**
3. **Settings** → **General** → **Root Directory**

**Debe ser exactamente:** `client`

Si está vacío o en `.` (raíz), cambiá a `client` y hacé **Redeploy**.

## 3. Verificar el build

En **Deployments** → último deploy → **Building**:

- Debe ejecutar `npm run build:vercel`
- Debe ver "Copied server/dist -> client/server/dist"
- No debe fallar

Si el build falla, revisá los logs. Si termina en < 10 segundos, puede que esté usando cache incorrecta.

## 4. Variables de entorno

En **Settings** → **Environment Variables** (Production):

| Variable | Requerido | Ejemplo |
|---------|-----------|---------|
| SUPABASE_DATABASE_URL | Sí | `postgresql://postgres.xxx:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| JWT_SECRET | Sí | `hashrate-jwt-secreto-produccion-2024` |

Usá la URL del **pooler** de Supabase (puerto 6543), no la conexión directa.

## 5. Si nada funciona: usar Render para la API

Si la API en Vercel sigue sin responder:

1. Desplegá el backend en [Render](https://render.com) (Root Directory: `server`)
2. En Vercel, agregá `VITE_API_URL` = URL de Render
3. Restaurá el proxy en `client/vercel.json`:
   ```json
   {"rewrites":[{"source":"/api/:path*","destination":"https://TU-URL-RENDER.com/api/:path*"},{"source":"/((?!api/).*)","destination":"/index.html"}]}
   ```
