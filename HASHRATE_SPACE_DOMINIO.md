# Dominio hashrate.space — DNS y Vercel

## Objetivo

- Sitio canónico: **`https://hashrate.space`**
- **`https://www.hashrate.space`** debe redirigir al apex (misma ruta)

## Error `NET::ERR_CERT_COMMON_NAME_INVALID` en www

Significa que el navegador llegó a un servidor HTTPS cuyo certificado **no incluye** `www.hashrate.space`.

El redirect en `vercel.json` **solo funciona después** de que Vercel tenga el dominio `www` asignado al proyecto y el certificado Let's Encrypt esté emitido. Sin eso, el TLS falla antes del redirect.

### Checklist (panel Vercel)

1. [Vercel → Project → Settings → Domains](https://vercel.com/dashboard)
2. Agregar **`hashrate.space`** (apex) si no está.
3. Agregar **`www.hashrate.space`** al **mismo** proyecto.
4. Esperar estado **Valid Configuration** + certificado listo (puede tardar unos minutos).
5. DNS (ya suele estar así):
   - Apex `hashrate.space` → A `76.76.21.21` (o el que indique Vercel)
   - `www` → CNAME `cname.vercel-dns.com`

### Redirect en código

`vercel.json` redirige de forma permanente:

- `www.hashrate.space/*` → `https://hashrate.space/*`
- `app.hashrate.space/*` → `https://hashrate.space/*`

Tras agregar el dominio y desplegar, probar:

```text
https://www.hashrate.space/
https://www.hashrate.space/equipment
```

Deberían responder **308/301** hacia `https://hashrate.space/...` sin aviso de certificado.

## Verificación DNS

```powershell
nslookup hashrate.space
nslookup www.hashrate.space
```

Ambos deben resolver a infraestructura Vercel (no a IPs antiguas del hosting previo).
