# Desplegar el proyecto en Vercel (frontend + API en la misma cuenta)

El proyecto está listo para desplegarse **completo** en Vercel: el frontend (React) y la API (Express) se sirven desde el mismo dominio.

## Pasos para subir a tu cuenta de Vercel

### 1. Subir el código a GitHub (si aún no está)
- Asegurate de que el repo esté en GitHub y que tengas los últimos cambios en la rama `main` (o la que uses).
- Incluye los archivos que agregamos: `api/[[...path]].js` y el `vercel.json` actualizado.

### 2. Conectar con Vercel
1. Entrá a [vercel.com](https://vercel.com) e iniciá sesión.
2. **Add New** → **Project**.
3. **Import** el repositorio de GitHub (hashrate_app o el nombre que tenga).
4. **Import** (no cambies aún el Root Directory).

### 3. Configuración del proyecto en Vercel
- **Framework Preset:** Other (o dejá lo que detecte; el `vercel.json` define el build).
- **Root Directory:** dejá la raíz del repo (donde están `client`, `server`, `api`, `vercel.json`).
- **Build Command:** `npm run build` (ya está en vercel.json).
- **Output Directory:** `client/dist` (ya está en vercel.json).
- **Install Command:** `npm install` (por defecto).

### 4. Variables de entorno (recomendado)
En **Settings → Environment Variables** agregá:

| Variable      | Valor              | Uso |
|---------------|--------------------|-----|
| `SQLITE_PATH` | `/tmp/data.db`     | Base de datos en disco temporal (necesario en Vercel serverless). |
| `JWT_SECRET`  | Una frase larga y aleatoria (mín. 16 caracteres) | Firma del login. |
| `CORS_ORIGIN` | *(opcional)* Tu URL de Vercel, ej. `https://tu-proyecto.vercel.app` | Si querés restringir CORS. |

- **Importante:** `SQLITE_PATH=/tmp/data.db` hace que la base de datos se guarde en `/tmp`. En serverless los datos pueden no persistir entre despliegues o reinicios; para datos permanentes más adelante podrías usar Vercel Postgres u otra DB externa.

### 5. Deploy
- **Deploy** y esperá a que termine el build.
- La URL será algo como `https://tu-proyecto.vercel.app`.

### 6. Probar
- Abrí la URL: deberías ver la app (login, Facturación, etc.).
- El frontend llama a `/api` en el mismo dominio; no hace falta configurar `VITE_API_URL` para este despliegue.

## Si algo falla

- **Build falla:** Revisá en Vercel los logs del build. Debe ejecutarse `npm run build` en la raíz (compila `client` y `server`).
- **Error 502 en /api:** Revisá que exista `api/[[...path]].js` y que el build del server genere `server/dist/app.js`.
- **Base de datos:** Si no definiste `SQLITE_PATH`, el servidor puede intentar escribir en un directorio de solo lectura. Definí `SQLITE_PATH=/tmp/data.db`.

## Resumen de lo que hace este setup

- **vercel.json:** Build en la raíz, salida estática desde `client/dist`, y reescrituras para que la SPA use `index.html` en rutas que no son `/api`.
- **api/[[...path]].js:** Todas las peticiones a `/api/*` las atiende el mismo Express (tu backend) en una función serverless.
- **Client:** En dominios `*.vercel.app` usa la API en el mismo origen (no necesita `VITE_API_URL`).

Cuando quieras, podés repetir el proceso desde la misma cuenta de Vercel en otro proyecto o rama usando el mismo repo.
