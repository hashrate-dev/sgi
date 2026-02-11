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
- Anotar la URL del sitio (ej. `https://hashrateapp.vercel.app`).

## 3. Render (backend)
- [ ] **Web Service** conectado al repo **hashrate_app**.
- [ ] Aplicar el **Blueprint** (`render.yaml`) o configurar a mano:
  - **Root Directory:** `server`
  - **Build Command:** `npm install && npm run build`
  - **Start Command:** `npm start`
- [ ] **Environment:**  
  `CORS_ORIGIN` = URL de Vercel (ej. `https://hashrateapp.vercel.app`) **sin** barra final.
- [ ] Anotar la URL del servicio (ej. `https://hashrate-api.onrender.com`).

## 4. Comprobar
- Abrir la URL de Vercel: la app carga.
- Ir a Clientes y agregar uno: debe guardar sin error (llamada a la API de Render).
- En Render, en **Logs**, no debe haber errores.

## Resumen de variables
| Servicio | Variable        | Valor (ejemplo)                          |
|----------|-----------------|------------------------------------------|
| Vercel   | VITE_API_URL    | https://hashrate-api.onrender.com        |
| Render   | CORS_ORIGIN     | https://hashrateapp.vercel.app           |

Siempre **sin** barra final en las URLs.
