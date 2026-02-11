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

## Desplegar en Vercel

El proyecto est? listo para desplegar solo el **frontend** (client) en Vercel:

1. **Conectar el repo**
   - Entr? en [vercel.com](https://vercel.com) e inici? sesi?n.
   - ?Add New?? ? ?Project? e import? el repositorio de GitHub/GitLab/Bitbucket.

2. **Configuraci?n del proyecto**
   - **Root Directory:** dejalo en `.` (ra?z del repo).
   - **Build Command:** `npm run build -w client` (ya viene en `vercel.json`).
   - **Output Directory:** `client/dist` (ya viene en `vercel.json`).
   - **Install Command:** `npm install` (por defecto).

3. **Deploy**
   - Hac? clic en ?Deploy?. Vercel va a instalar dependencias, construir el client y publicar el sitio.

4. **Para que la app funcione de punta a punta**
   - En Vercel solo se despliega el **frontend**. El backend (Express) no corre en Vercel.
   - Para que clientes, facturas y reportes funcionen en producci?n:
     1. Desplegá el **server** en otro servicio (Railway, Render, Koyeb, etc.) con Node, con `PORT`, `SQLITE_PATH` (opcional) y `CORS_ORIGIN` configurados.
     2. En **Vercel** ? tu proyecto ? **Settings** ? **Environment Variables** agreg?:
        - **Name:** `VITE_API_URL`
        - **Value:** la URL base del backend, ej. `https://tu-api.railway.app` (sin barra final).
     3. Volv? a desplegar (Redeploy) para que el build del client use esa URL.
   - Si no configur?s `VITE_API_URL`, el sitio en Vercel carga pero las llamadas a la API fallan (no hay backend en ese dominio).

## Notas

- El front ya incluye pantallas en React para **Home / Facturaci?n / Historial / Clientes / Reportes**.
- **Facturaci?n** y **Historial** ya migraron la l?gica principal (PDF, totales, filtros, gr?fico y exportaci?n a Excel).
- El front usa la API (`/api/invoices`, `/api/clients`) cuando el backend est? disponible.

