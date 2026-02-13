# Cómo hacer que funcione el login en https://sgi-hrs.vercel.app

## Qué se corrigió en el código

- En **sgi-hrs.vercel.app** el frontend **siempre** usa el backend **https://sgi.onrender.com** (ya no usa una URL guardada en el navegador que pueda estar mal).
- El backend en el código ya permite CORS desde **https://sgi-hrs.vercel.app** por defecto.

---

## Qué tenés que revisar vos

### 1. Render (backend): CORS

Si en Render tenés la variable **CORS_ORIGIN** definida, **reemplaza** el valor por uno de estos:

**Opción A – Solo tu app en Vercel:**
```text
CORS_ORIGIN=https://sgi-hrs.vercel.app
```

**Opción B – Varias orígenes (separados por coma, sin espacios):**
```text
CORS_ORIGIN=https://sgi-hrs.vercel.app
```

- Entrá a **Render** → servicio **sgi** → **Environment**.
- Editá o agregá **CORS_ORIGIN** con uno de los valores de arriba.
- Guardá y hacé **Manual Deploy** del servicio.

Si **no** tenés **CORS_ORIGIN** en Render, el código del backend ya incluye `https://sgi-hrs.vercel.app` por defecto; en ese caso solo hace falta que el último deploy en Render sea el que tiene ese código.

---

### 2. Render: que el servicio esté vivo

- En **Render** → servicio **sgi** el estado tiene que ser **Live** (verde).
- Si está **Sleeping**, el primer login puede tardar **30–60 segundos** (cold start). Esperá y probá de nuevo.

Probar que el backend responda:

- Abrí en el navegador: **https://sgi.onrender.com/api/health**
- Deberías ver una respuesta JSON. Si no carga, el backend no está activo o hay un error en Render.

---

### 3. Vercel: redeploy después de los cambios

- Subí los últimos cambios a GitHub (incluido el fix del login en Vercel).
- En **Vercel** se hace deploy automático; si no, entrá al proyecto y hacé **Redeploy** del último deployment.

No es obligatorio configurar **VITE_API_URL** en Vercel para que funcione el login en sgi-hrs.vercel.app; el frontend ya usa **https://sgi.onrender.com** cuando detecta que está en ese dominio.

---

### 4. Probar el login

1. Abrí **https://sgi-hrs.vercel.app** (mejor en una ventana de incógnito o después de borrar datos del sitio).
2. Usuario: **fb@hashrate.space**
3. Contraseña: **123456**
4. Si tarda, esperá hasta 1 minuto (por si el backend en Render estaba dormido).

---

## Si sigue sin funcionar

- Abrí la **consola** del navegador (F12 → pestaña Console).
- Intentá hacer login y anotá el **mensaje de error** exacto.
- Decime también si **https://sgi.onrender.com/api/health** te responde o no.

Con eso se puede ver si el fallo es por CORS, por backend caído o por otra cosa.
