# Configurar Supabase en Vercel

## Error "Tenant or user not found"

El pooler de Supabase usa hosts distintos según el proyecto (`aws-0` o `aws-1`). Hay que usar la URL exacta del dashboard.

## Pasos

1. Entrá a [Supabase Dashboard](https://supabase.com/dashboard) → tu proyecto
2. **Settings** (⚙️) → **Database**
3. Bajá hasta **Connection string**
4. Elegí **URI**
5. Seleccioná **Connection pooling** (Transaction mode, puerto 6543)
6. Hacé clic en **Copy** para copiar la URL completa

La URL se verá así:
```
postgresql://postgres.cvzkjjzwnzwbopvsnqwi:[YOUR-PASSWORD]@aws-X-REGION.pooler.supabase.com:6543/postgres
```

7. En **Vercel** → proyecto sgi-two → **Settings** → **Environment Variables**
8. Editá `SUPABASE_DATABASE_URL` y pegá la URL copiada (reemplazá `[YOUR-PASSWORD]` con tu contraseña si hace falta)
9. **Redeploy** del proyecto

## Si la contraseña no está en la URL

En Supabase → Settings → Database → **Reset database password** y usá la nueva contraseña en la URL.
