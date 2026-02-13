# Resumen de deploy – GitHub, local, Vercel, Render

## Hecho en esta sesión

### 1. GitHub
- **Commit:** `Deploy: nombres Excel con fecha, ClientesHRS_Activos, Facturas_Pendientes_Hosting, layout facturacion-hosting alineado con topbar`
- **Push:** `main` → `https://github.com/hashrate-dev/sgi.git`
- **Estado:** subido correctamente.

### 2. Local
- **Comando:** `npm run dev` (desde la raíz del proyecto).
- **Estado:** servidor en ejecución en segundo plano.
- **URLs:** cliente en `http://localhost:5173`, API en el puerto que muestre el terminal del server.

---

## Vercel (deploy desde GitHub o CLI)

Si el repo **hashrate-dev/sgi** está conectado a un proyecto en Vercel, el **push a `main` ya dispara un deploy automático**.

- Revisá en [vercel.com/dashboard](https://vercel.com/dashboard) el proyecto vinculado a **sgi** y el último deployment.
- Si no está conectado: **Add New → Project → Import** el repo `hashrate-dev/sgi`. Build: `npm run build`, Output: `dist` (según `vercel.json`).
- Para forzar un deploy desde la PC:  
  `vercel login` (una vez) y luego `npx vercel --prod`.

---

## Render (backend API)

Si el repo **hashrate-dev/sgi** está conectado a un Web Service en Render, el **push a `main` ya dispara un deploy automático**.

- Revisá en [dashboard.render.com](https://dashboard.render.com) el servicio (por ejemplo **hashrate-api**) y el último deploy.
- Si no está configurado: **New → Web Service**, conectar el repo, **Root Directory:** `server`, **Build:** `npm install && npm run build`, **Start:** `npm start`. Variables: `CORS_ORIGIN` = URL de tu front (ej. Vercel).
- El `render.yaml` del repo define un servicio con `rootDir: server`; podés usar **Blueprint** para crear el servicio desde ese archivo.

---

## Resumen rápido

| Destino   | Acción realizada / qué hacer |
|----------|-------------------------------|
| **GitHub** | Push a `main` hecho. Código en `hashrate-dev/sgi`. |
| **Local**  | `npm run dev` en ejecución (cliente + server). |
| **Vercel** | Deploy automático si el repo está conectado; si no, conectar repo o usar `vercel login` + `npx vercel --prod`. |
| **Render** | Deploy automático si el repo está conectado; si no, crear Web Service con Root `server` o aplicar el Blueprint. |
