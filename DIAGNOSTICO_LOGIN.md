# Diagnóstico: No puedo loguearme en https://sgi-hrs.vercel.app

## Pasos para diagnosticar el problema

### 1. Verificar el backend en Render

**Abrí en el navegador:**
```
https://sistema-gestion-interna.onrender.com/api/health
```

**Resultados esperados:**
- ✅ **Si funciona:** Deberías ver una respuesta JSON (ej: `{"ok":true}` o similar). El backend está activo.
- ❌ **Si no carga o da error:** El servicio en Render está caído o dormido. Esperá 30-60 segundos y probá de nuevo (cold start).

---

### 2. Verificar CORS en Render

**En Render Dashboard:**
1. Entrá a tu servicio **sgi** → **Environment**
2. Verificá que exista la variable **`CORS_ORIGIN`**
3. El valor debe ser: **`https://sgi-hrs.vercel.app`** (sin barra final)
4. Si no existe o está mal, agregala/corregila y hacé **Manual Deploy**

**Para verificar si CORS está bloqueando:**
- Abrí la consola del navegador (F12) en https://sgi-hrs.vercel.app
- Intentá hacer login
- Si ves un error como **"CORS policy"** o **"Access-Control-Allow-Origin"**, el problema es CORS

---

### 3. Verificar VITE_API_URL en Vercel

**En Vercel Dashboard:**
1. Entrá a tu proyecto **sgi-hrs** → **Settings** → **Environment Variables**
2. Buscá la variable **`VITE_API_URL`**
3. El valor debe ser: **`https://sistema-gestion-interna.onrender.com`** (sin `/` final, sin `http://`)
4. Debe estar aplicada a **Production** (y Preview si querés)

**Si no existe o está mal:**
- Agregala/corregila
- **IMPORTANTE:** Hacé **Redeploy** del proyecto (Deployments → ⋮ → Redeploy)
- Sin redeploy, el frontend sigue usando la configuración anterior

---

### 4. Verificar qué URL está usando el frontend

**En el navegador (https://sgi-hrs.vercel.app):**
1. Abrí la consola (F12) → pestaña **Console**
2. Escribí:
   ```javascript
   localStorage.getItem('hrs_api_url')
   ```
3. Debería mostrar: **`https://sistema-gestion-interna.onrender.com`** o estar vacío (si usa la default)

**Si muestra otra URL:**
- Limpiá el localStorage: `localStorage.removeItem('hrs_api_url')`
- Recargá la página y probá de nuevo

---

### 5. Verificar errores en la consola

**Al intentar hacer login:**
1. Abrí la consola (F12) → pestaña **Console**
2. Intentá hacer login con `fb@hashrate.space` / `123456`
3. Revisá los errores que aparecen:

**Errores comunes:**

| Error | Causa | Solución |
|-------|-------|----------|
| `Failed to fetch` o `NetworkError` | CORS bloqueado o backend dormido | Verificar CORS_ORIGIN en Render, esperar 30-60s si estaba dormido |
| `502 Bad Gateway` o `503 Service Unavailable` | Backend dormido o caído | Esperar 30-60 segundos y reintentar |
| `404 Not Found` | URL del backend incorrecta | Verificar VITE_API_URL en Vercel y redeploy |
| `Usuario o contraseña incorrectos` | Credenciales incorrectas o usuario no existe | Verificar que el backend tenga el usuario `fb@hashrate.space` con contraseña `123456` |
| `No se pudo conectar con el servidor` | Backend no responde | Verificar que https://sistema-gestion-interna.onrender.com/api/health responda |

---

### 6. Verificar que el usuario existe en el backend

El backend crea automáticamente estos usuarios al primer login:
- `fb@hashrate.space` / `123456` (admin_b)
- `jv@hashrate.space` / `admin123` (admin_a)

**Si el usuario no existe:**
- El backend debería crearlo automáticamente en el primer intento de login
- Si falla, puede ser un problema de permisos en la base de datos en Render

---

### 7. Verificar logs en Render

**En Render Dashboard:**
1. Entrá a tu servicio **sgi** → pestaña **Logs**
2. Intentá hacer login desde https://sgi-hrs.vercel.app
3. Revisá los logs para ver:
   - Si llegan las peticiones de login
   - Si hay errores de base de datos
   - Si hay errores de CORS

**Logs esperados al hacer login:**
- Deberías ver una línea como: `POST /api/auth/login`
- Si no aparece nada, el problema es CORS o la URL del backend está mal

---

## Checklist rápido

- [ ] Backend responde: https://sistema-gestion-interna.onrender.com/api/health funciona
- [ ] CORS_ORIGIN en Render = `https://sgi-hrs.vercel.app`
- [ ] VITE_API_URL en Vercel = `https://sistema-gestion-interna.onrender.com`
- [ ] Vercel hizo redeploy después de cambiar VITE_API_URL
- [ ] Render hizo deploy después de cambiar CORS_ORIGIN
- [ ] Esperaste 30-60 segundos si el backend estaba dormido
- [ ] No hay errores de CORS en la consola del navegador
- [ ] El localStorage no tiene una URL incorrecta guardada

---

## Si nada funciona

1. **Limpiá el localStorage del navegador:**
   ```javascript
   localStorage.clear()
   ```
   Recargá la página y probá de nuevo.

2. **Verificá que el backend esté activo:**
   - En Render → servicio **sgi** → verifica que el estado sea **Live**
   - Si está **Sleeping**, hacé una petición a https://sistema-gestion-interna.onrender.com/api/health para despertarlo

3. **Verificá la configuración de Render:**
   - Root Directory: `server`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: `NODE_ENV=production`, `SQLITE_PATH=/tmp/data.db`, `CORS_ORIGIN=https://sgi-hrs.vercel.app`

4. **Verificá la configuración de Vercel:**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Environment Variable: `VITE_API_URL=https://sistema-gestion-interna.onrender.com`

---

## Contacto y soporte

Si después de seguir todos estos pasos sigue sin funcionar, compartí:
1. El error exacto que aparece en la consola del navegador
2. Los logs de Render (últimas 50 líneas)
3. El valor de `localStorage.getItem('hrs_api_url')` en la consola
4. Si https://sistema-gestion-interna.onrender.com/api/health responde o no
