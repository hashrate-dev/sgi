# Cómo correr la app en localhost

## Opción A: Desarrollo (recomendado)

1. **Abrir terminal** en la carpeta del proyecto (donde está este archivo).

2. **Instalar dependencias** (solo la primera vez):
   ```bash
   npm install
   ```

3. **Arrancar servidor y cliente:**
   ```bash
   npm run dev
   ```

4. **Abrir en el navegador:** **http://localhost:5173**
   - Si ves "Port 5173 is in use...", usá la URL que indique (ej. **http://localhost:5174**).

## Opción B: Solo servidor (app incluida)

1. **Build** (una vez):
   ```bash
   npm run build
   ```

2. **Arrancar solo el servidor:**
   ```bash
   npm start
   ```

3. **Abrir en el navegador:** **http://localhost:8080**  
   La app se sirve desde el mismo puerto que la API.

---

**Login de prueba:** `jv@hashrate.space` / `admin123`

**Si no funciona:**

- ¿Aparece **"API listening on http://0.0.0.0:8080"**? Si no, el backend no arrancó (revisá el error en rojo).
- Con `npm run dev`: abrí **http://localhost:5173** (no 8080).
- Con `npm start`: abrí **http://localhost:8080** (después de `npm run build`).
- Cerrá otros programas que usen el puerto 5173 o 8080.
