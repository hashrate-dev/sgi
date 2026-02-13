# Backend en Render: checklist para que funcione el login en https://sgi-hrs.vercel.app

Si no podés iniciar sesión en **https://sgi-hrs.vercel.app** (usuario `fb@hashrate.space` / contraseña `123456`), revisá estos puntos.

---

## 1. CORS en Render

El backend debe aceptar peticiones desde tu front en Vercel.

- En **Render** → tu servicio (API) → **Environment**.
- Agregá o editá la variable:
  - **Key:** `CORS_ORIGIN`
  - **Value:** `https://sgi-hrs.vercel.app`  
  (sin barra final; si querés varios orígenes separalos por coma).
- Guardá y hacé **Manual Deploy** para aplicar los cambios.

**Nota:** Si no definís `CORS_ORIGIN`, el servidor ya permite por defecto `https://sgi-hrs.vercel.app` y `https://hashrateapp.vercel.app`. Si la definís, tené que incluir `https://sgi-hrs.vercel.app` en la lista.

---

## 2. URL del backend en Vercel

El frontend debe saber la URL de tu API en Render.

- En **Vercel** → proyecto **sgi-hrs** (o el que corresponda) → **Settings** → **Environment Variables**.
- Agregá:
  - **Name:** `VITE_API_URL` (exactamente así, con `VITE_`).
  - **Value:** la URL de tu servicio en Render, **sin** barra final.  
    Para este proyecto (sgi-hrs): **`https://sgi.onrender.com`**
- Aplicá a **Production** (y Preview si querés).
- **Redeploy:** en **Deployments** → menú ⋮ del último deploy → **Redeploy**. Sin un nuevo deploy, el front no usa la variable nueva.

---

## 3. Nombre del servicio en Render

La URL de tu API depende del nombre del servicio en Render.

- Entrá a [dashboard.render.com](https://dashboard.render.com) y abrí tu **Web Service** (el backend).
- La URL es del tipo: `https://<nombre-del-servicio>.onrender.com`.
- Para este proyecto la URL del backend es: **`https://sgi.onrender.com`** (ponéla en `VITE_API_URL` en Vercel).

---

## 4. Cold start (servicio dormido)

En el plan gratuito de Render, el servicio se duerme tras unos minutos sin uso.

- La **primera** petición después de dormirse puede tardar **30–60 segundos**.
- Si el login falla a la primera, esperá 1 minuto y probá de nuevo.
- Si sigue fallando, revisá los puntos 1, 2 y 3.

---

## 5. Probar el backend directo

Para ver si el backend responde:

- Abrí en el navegador: `https://TU-SERVICIO.onrender.com/api/health`  
  (reemplazá `TU-SERVICIO` por el nombre real).
- Deberías ver una respuesta JSON (por ejemplo `{"ok":true}` o similar).

Si eso no carga o da error, el problema está en Render (servicio caído, build fallido, etc.). Si carga bien, el problema suele ser CORS o `VITE_API_URL` en Vercel.

---

## Resumen rápido

| Dónde   | Qué hacer |
|--------|-----------|
| **Render** | Variable `CORS_ORIGIN` = `https://sgi-hrs.vercel.app`. Manual Deploy. |
| **Vercel** | Variable `VITE_API_URL` = `https://sgi.onrender.com` (sin `/` final). **Redeploy** después. |
| **Primer login** | Si el servicio estaba dormido, esperar ~1 min y reintentar. |

Después de aplicar esto, probá de nuevo el login en https://sgi-hrs.vercel.app con `fb@hashrate.space` / `123456`.
