# GitHub + Vercel + Render: checklist

## 1. GitHub
- Repo: **hashrate_app** con el código en la rama `main`.
- Cada **push a main** puede activar deploy automático en Vercel y Render (si están conectados).

## 2. Vercel (frontend)
- [ ] Proyecto conectado al repo **hashrate_app**.
- [ ] **Root Directory:** `client`.
- [ ] **Environment Variables:**  
  `VITE_API_URL` = URL del backend en Render (ej. `https://hashrate-api.onrender.com`) **sin** barra final.
- [ ] Después de agregar o cambiar `VITE_API_URL`, hacer **Redeploy**.
- Anotar la URL del sitio: **https://sgi-hrs.vercel.app**

## 3. Render (backend)
- [ ] **Web Service** conectado al repo **hashrate_app**.
- [ ] Aplicar el **Blueprint** (`render.yaml`) o configurar a mano:
  - **Root Directory:** `server`
  - **Build Command:** `npm install && npm run build`
  - **Start Command:** `npm start`
  - **Disk:** el Blueprint incluye un disco persistente (`/data`, 1 GB) y `SQLITE_PATH=/data/data.db` para que **usuarios, clientes y toda la base de datos se conserven entre deploys**.
- [ ] **Environment:**  
  `CORS_ORIGIN` = **https://sgi-hrs.vercel.app** (sin barra final).  
  Si no usás el Blueprint, agregar también `SQLITE_PATH=/data/data.db` y crear un **Disk** en Render (mount path `/data`) para no perder datos en cada deploy.
- [ ] Anotar la URL del servicio (ej. `https://hashrate-api.onrender.com`).

## 4. Comprobar
- Abrir la URL de Vercel: la app carga.
- Ir a Clientes y agregar uno: debe guardar sin error (llamada a la API de Render).
- En Render, en **Logs**, no debe haber errores.

## Resumen de variables
| Servicio | Variable        | Valor (ejemplo)                          |
|----------|-----------------|------------------------------------------|
| Vercel   | VITE_API_URL    | https://sistema-gestion-interna.onrender.com                 |
| Render   | CORS_ORIGIN     | https://sgi-hrs.vercel.app               |

Siempre **sin** barra final en las URLs.

## Persistencia de datos en Render (ya configurado en el Blueprint)
El `render.yaml` incluye un **disco persistente** (`/data`) y `SQLITE_PATH=/data/data.db`. Así la base SQLite (usuarios, clientes, facturas del API, actividad) **no se borra en cada deploy**.  
**Si el servicio ya existía sin disco:** en Render → tu servicio → **Disks** → **Add Disk** (name: `data`, mount path: `/data`, 1 GB). En **Environment** agregar `SQLITE_PATH` = `/data/data.db`. Luego **Redeploy**. A partir de ese deploy, los datos se mantienen.

## Si no anda
- **Front carga pero no guarda:** En Vercel tiene que existir `VITE_API_URL` y después hay que hacer **Redeploy** (el valor se usa en el build).
- **Error de CORS en el navegador:** En Render, `CORS_ORIGIN` debe ser exactamente la URL del front (la que ves en la barra del navegador al usar la app en Vercel). Podés poner varias separadas por coma si tenés más de un dominio.
- **Render:** En los logs del servicio deberías ver `API listening on :XXXX` y, si definiste `CORS_ORIGIN`, `CORS allowed origin: https://...`.
