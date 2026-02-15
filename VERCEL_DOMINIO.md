# Dominio y URL de producción (Vercel)

**URL actual de la app:** https://sgi-client.vercel.app  

Si querés usar un dominio propio (ej. **sgi.hashrate.space**) y no abre o da error, seguí estos pasos.

## 1. Probar primero la URL por defecto de Vercel

En el dashboard de Vercel → tu proyecto → **Deployments** → abrí el último deployment y copiá la URL (ej. `https://tu-proyecto.vercel.app`).

- Si **https://sgi-client.vercel.app** sí abre la app → el problema es solo el dominio custom (ej. sgi.hashrate.space).
- Si **esa URL tampoco abre** → el problema es el deploy o el build (ver sección 4).

## 2. Agregar el dominio en Vercel

1. Entrá a [vercel.com/dashboard](https://vercel.com/dashboard) → tu proyecto.
2. **Settings** → **Domains**.
3. En "Add", escribí: **`sgi.hashrate.space`** (sin `https://`, sin barra final).
4. **Add**.
5. Vercel te va a mostrar unos **registros DNS** que tenés que configurar en donde tengas el dominio (ej. Cloudflare, Namecheap, GoDaddy, etc.).

## 3. Configurar DNS del dominio

En el panel de tu proveedor de dominio (hashrate.space):

- Si Vercel pide un **CNAME**:  
  - Nombre/host: **`sgi`** (o `sgi.hashrate.space` según el panel).  
  - Valor/apunta a: **`cname.vercel-dns.com`** (o el que te indique Vercel).
- Si en su lugar te pide **A**, usá los IP que te muestre Vercel (suelen ser 76.76.21.21 o similares).

Guardá los cambios y esperá unos minutos (a veces hasta 48 h, pero en general 5–15 minutos). En Vercel, en **Domains**, el estado del dominio debería pasar a "Valid Configuration" / listo.

## 4. Si el build en Vercel falla o la app no se ve

- **Root Directory:** tiene que ser **`client`** (solo el frontend).
- **Build Command:** `npm run build` (Vite por defecto).
- **Output Directory:** `dist`.
- **Install Command:** `npm install`.

Si en la raíz del repo tenés un `vercel.json` con `outputDirectory: "dist"`, al usar Root Directory = **client**, la salida del build de Vite ya es `client/dist`; en Vercel poné **Output Directory** = **`dist`** (relativo a `client`).

Si preferís desplegar desde la **raíz** del repo:
- **Build Command:** `npm run build:vercel`
- **Output Directory:** `dist`
- Así se construye solo el client y se deja la salida en `dist` para Vercel.

## 5. Resumen

| Qué probar | Dónde |
|------------|--------|
| ¿Abre la URL *.vercel.app? | Deployments → abrir el deployment |
| ¿Dominio agregado? | Settings → Domains → sgi.hashrate.space |
| ¿DNS correcto? | Donde administrás hashrate.space (CNAME a cname.vercel-dns.com) |
| ¿Build correcto? | Settings → General → Root Directory = client, Build/Output como arriba |

Cuando **sgi.hashrate.space** esté verde en Vercel y el DNS propagado, el link **https://sgi.hashrate.space** debería funcionar.
