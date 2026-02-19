# Dominio custom (app.hashrate.space) y CORS

## Problema resuelto

Cuando usás el dominio custom `https://app.hashrate.space` en lugar de `https://sgi-two.vercel.app`, el cliente intentaba llamar al backend en Render (`sistema-gestion-interna.onrender.com`), lo que generaba errores de CORS porque son orígenes distintos.

## Solución aplicada

`app.hashrate.space` ahora usa la **misma API** que el frontend (mismo origen en Vercel). Las peticiones van a `https://app.hashrate.space/api/...` sin CORS.

## Configuración DNS en Vercel

Para que el dominio custom funcione:

1. **Vercel Dashboard** → tu proyecto → **Settings** → **Domains**
2. Agregá `app.hashrate.space`
3. Configurá el DNS según lo que indique Vercel:
   - **CNAME**: `app` → `cname.vercel-dns.com` (o el valor que muestre Vercel)
   - O usá los nameservers de Vercel si tenés el dominio ahí

4. Esperá la propagación (puede tardar hasta 24–48 h)
5. Verificá que el certificado SSL esté activo (Vercel lo gestiona automáticamente)

## Verificar que apunta a Vercel

```bash
# Debería resolver a los IPs de Vercel
nslookup app.hashrate.space
```

Si el DNS no apunta a Vercel, el dominio cargará otra app o dará error, y las peticiones a `/api/*` no llegarán al backend correcto.
