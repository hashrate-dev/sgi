# Deploy a Vercel (hay que correrlo en tu terminal)

Desde este asistente **no se puede** hacer el deploy porque Vercel pide confirmación interactiva. Tenés que ejecutar los comandos **vos** en la terminal de Cursor.

## Una sola vez: vincular el proyecto

En la terminal (Ctrl+` o View → Terminal), en la carpeta del proyecto:

```bash
npx vercel link --scope hashrates-projects
```

Elegí **Create new project** y el nombre que quieras (ej. `sgi-hrs`). Cuando termine, queda vinculado.

## Cada vez que quieras desplegar

```bash
npm run deploy:vercel
```

o:

```bash
npx vercel --prod --scope hashrates-projects
```

Eso sube el código y te da la URL del sitio.

---

**Variables en Vercel:** Para que el login funcione, en [vercel.com](https://vercel.com) → tu proyecto → **Settings → Environment Variables** tené **`SUPABASE_DATABASE_URL`** y **`JWT_SECRET`** definidas y luego **Redeploy**.
