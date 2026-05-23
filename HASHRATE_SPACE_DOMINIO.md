# Dominio hashrate.space — DNS y Vercel

## Por qué falla `https://hashrate.space` con ERR_CONNECTION_CLOSED

El código de la app ya está preparado para `hashrate.space`, pero **el DNS del dominio raíz (sin www) todavía no apunta a Vercel**:

| Host | DNS actual | Estado |
|------|------------|--------|
| `www.hashrate.space` | Vercel (`cname.vercel-dns.com`) | OK — responde 200 |
| `app.hashrate.space` | Vercel | OK — responde 200 |
| **`hashrate.space` (apex)** | **IP `179.27.153.62`** (servidor antiguo) | **Falla** — cierra la conexión HTTPS |

Hasta cambiar el DNS del apex, usá **`https://www.hashrate.space`** (o `app.hashrate.space`).

## Pasos en Vercel

1. Proyecto del frontend → **Settings → Domains**.
2. Agregar **`hashrate.space`** (apex) si no está.
3. Agregar **`www.hashrate.space`** si falta.
4. Esperar certificado SSL “Valid”.
5. Variables de entorno (Production):
   - `APP_PUBLIC_URL` = `https://hashrate.space` o `https://www.hashrate.space`
   - `SUPABASE_DATABASE_URL`, `JWT_SECRET`, etc. (igual que en `app`)

## Pasos en el proveedor DNS (donde compraste el dominio)

### Opción recomendada: apex + www en Vercel

1. **Eliminar** o dejar de usar el registro **A** de `@` → `179.27.153.62` (hosting viejo).
2. Configurar según lo que muestre Vercel en Domains:
   - **A** `@` → `76.76.21.22` (IP que indica Vercel para apex), **o**
   - **ALIAS/ANAME** `@` → `cname.vercel-dns.com` (si tu DNS lo permite).
3. **CNAME** `www` → `cname.vercel-dns.com` (ya suele estar bien).

### Mientras el apex no migre

- Sitio público: **https://www.hashrate.space/marketplace/home**
- El `vercel.json` redirige `app.hashrate.space` → `www.hashrate.space` tras el próximo deploy.

## URLs antiguas de WordPress

| Antes | Ahora |
|-------|--------|
| `/en/` | `/marketplace/home` (idioma EN) |
| `/es/` | `/marketplace/home` (idioma ES) |
| `/en/services/` | `/marketplace/services` |

Propagación DNS: puede tardar **hasta 48 h** (a menudo 15–60 min).

## Comprobar

```bash
nslookup hashrate.space
nslookup www.hashrate.space
```

Cuando el apex esté bien, `hashrate.space` debe resolver a Vercel (no a `179.27.153.62`).
