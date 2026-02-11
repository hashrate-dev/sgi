# HRS GROUP - Sistema de Facturaci?n (Modernizado)

Este repo ahora est? modernizado como **monorepo**:

- `client/`: Front moderno con **Vite + React + TypeScript**
- `server/`: Back moderno con **Express + TypeScript** y **SQLite**

## Requisitos

- Node.js **20+**
- npm **9+**

## Instalaci?n

```bash
npm install
```

## Desarrollo (front + back a la vez)

```bash
npm run dev
```

- Front: `http://localhost:5173`
- API: `http://localhost:8080/api/health`

## Backend (SQLite)

El backend usa **SQLite** para clientes y facturas (archivo `server/data.db`). Opcionalmente configur? `.env` en la ra?z o en `server/` (ver `server/.env.example`):

```bash
NODE_ENV=development
PORT=8080
CORS_ORIGIN=http://localhost:5173
```

## Build

```bash
npm run build
```

## Scripts ?tiles

- `npm run dev`: corre `server` y `client` en paralelo
- `npm run start`: inicia el backend compilado (producci?n)
- `npm run legacy:dev`: corre el server anterior (`src/app.js`) por compatibilidad

## Conexi?n completa: GitHub + Vercel + Render

Para que la app funcione en producci?n (front en Vercel, API en Render, c?digo en GitHub):

| D?nde | Qu? hacer |
|-------|-----------|
| **GitHub** | Repo `hashrate_app` con el c?digo. Cada push a `main` dispara deploy en Vercel y Render. |
| **Vercel** | Conectar el repo. **Root Directory** = `client`. Variables: **VITE_API_URL** = URL de Render (ej. `https://hashrate-api.onrender.com`), sin barra final. |
| **Render** | Conectar el repo. Usar el Blueprint (`render.yaml`) o configurar: **Root Directory** = `server`, **Build** = `npm install && npm run build`, **Start** = `npm start`. Variable: **CORS_ORIGIN** = URL de Vercel (ej. `https://hashrateapp.vercel.app`), sin barra final. |

**Orden recomendado:** 1) Conectar GitHub a Vercel y desplegar (anotar la URL de Vercel). 2) Conectar GitHub a Render y desplegar (anotar la URL de Render). 3) En Render a?adir **CORS_ORIGIN** = URL de Vercel. 4) En Vercel a?adir **VITE_API_URL** = URL de Render. 5) En Vercel hacer **Redeploy**. Despu?s de eso, la app en Vercel usar? la API de Render.

## Desplegar en Vercel

El proyecto est? listo para desplegar solo el **frontend** (client) en Vercel:

1. **Conectar el repo**
   - Entr? en [vercel.com](https://vercel.com) e inici? sesi?n.
   - ?Add New?? ? ?Project? e import? el repositorio de GitHub/GitLab/Bitbucket.

2. **Configuraci?n del proyecto**
   - **Root Directory:** `client` (obligatorio para que coincida con `vercel.json`: build `npm run build`, output `dist`).
   - **Build Command** y **Output Directory** ya vienen en `vercel.json`; no hace falta cambiarlos si Root Directory es `client`.
   - **Install Command:** `npm install` (por defecto).

3. **Deploy**
   - Hac? clic en ?Deploy?. Vercel va a instalar dependencias, construir el client y publicar el sitio.

4. **Para que la app funcione de punta a punta** despleg? el backend en Railway (ver abajo) y configur? `VITE_API_URL` en Vercel con la URL del API.

## Desplegar el backend en Railway

Con el repo ya en GitHub:

1. Entr? a [railway.app](https://railway.app) e inici? sesi?n.
2. **New Project** ? **Deploy from GitHub repo** ? eleg? **hashrate_app**.
3. En el servicio creado, entr? a **Settings**:
   - **Root Directory:** `server` (as? Railway solo construye y corre el backend).
   - **Build Command:** (dej? vac?o; por defecto hace `npm install` y usa el `build` del `package.json`).
   - **Start Command:** (dej? vac?o; usa `npm start`).
4. **Variables** (pesta?a Variables):
   - `CORS_ORIGIN` = URL de tu front en Vercel, ej. `https://hashrateapp.vercel.app` (sin barra final).
   - `PORT` lo asigna Railway; no hace falta definirlo.
5. **Deploy**: Railway hace build y deploy. En **Settings** ? **Networking** ? **Generate Domain** obten? la URL p?blica (ej. `https://hashrate-app-production-xxxx.up.railway.app`).
6. En **Vercel** ? tu proyecto ? **Settings** ? **Environment Variables**:
   - **Name:** `VITE_API_URL`
   - **Value:** la URL de Railway (ej. `https://hashrate-app-production-xxxx.up.railway.app`), sin barra final.
7. En Vercel hac? **Redeploy** para que el front use la nueva API.

**Nota:** En Railway el disco es ef?mero por defecto; `data.db` puede perderse en un redeploy. Para persistir datos pod?s agregar un **Volume** en Railway y configurar `SQLITE_PATH` apuntando a una ruta dentro del volume.

## Desplegar el backend en Render

El repo incluye `render.yaml` (Blueprint). En [dashboard.render.com](https://dashboard.render.com): **New** ? **Web Service** ? repo **hashrate_app**. Si Render ofrece aplicar el Blueprint, acept? (queda Root Directory `server`, Build `npm install && npm run build`, Start `npm start`). En **Environment** agreg? **CORS_ORIGIN** = tu URL de Vercel. Copi? la URL del servicio y ponela en Vercel como **VITE_API_URL**, luego Redeploy del front.

## Notas

- El front ya incluye pantallas en React para **Home / Facturaci?n / Historial / Clientes / Reportes**.
- **Facturaci?n** y **Historial** ya migraron la l?gica principal (PDF, totales, filtros, gr?fico y exportaci?n a Excel).
- El front usa la API (`/api/invoices`, `/api/clients`) cuando el backend est? disponible.

