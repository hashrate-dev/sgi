# Fix 404 en /api/auth/me y /api/invoices en Vercel

## Errores que ves

- `GET https://sgi-two.vercel.app/api/auth/me 404 (Not Found)`
- `GET https://sgi-two.vercel.app/api/invoices/next-number?type=Factura&peek=1 404 (Not Found)`

Los mensajes de Pelagus, PHANTOM, provider-bridge son de extensiones del navegador y se pueden ignorar.

## Solución: Root Directory en Vercel

La causa más común es que **Root Directory** no coincida con la estructura del proyecto.

### Opción A: Root Directory = raíz (recomendado para Supabase)

1. Entrá a [vercel.com/dashboard](https://vercel.com/dashboard) → proyecto **sgi-two**
2. **Settings** → **General** → **Root Directory**
3. Dejalo **vacío** o poné **`.`** (raíz del repo, donde están `client`, `server`, `api`)
4. **Build Command:** `npm run build`
5. **Output Directory:** `dist`
6. **Redeploy**

### Opción B: Root Directory = client

Si ya tenés Root Directory = `client`:

1. Verificá que el build muestre: `Copied server/dist -> client/server/dist`
2. Si el build falla o tarda < 10 segundos, puede haber cache incorrecta → **Redeploy** sin cache (Settings → General → Build Cache → Disable)

## Variables de entorno obligatorias

En **Settings → Environment Variables** (Production):

| Variable | Requerido |
|----------|-----------|
| `SUPABASE_DATABASE_URL` | Sí – Connection string de Supabase (pooler, puerto 6543) |
| `JWT_SECRET` | Sí – String largo para firmar JWT |

## Probar

1. **https://sgi-two.vercel.app/api/health** → debe devolver `{"ok":true,"t":...}`
2. Si health responde OK pero login falla → revisá `SUPABASE_DATABASE_URL` y `JWT_SECRET`
3. Si health da 404 → la API no se despliega; verificá Root Directory y el build
