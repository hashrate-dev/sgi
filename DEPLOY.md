# Despliegue: Localhost, GitHub, Vercel y Supabase

## 1. Localhost

```bash
# Instalar dependencias (si no lo hiciste)
npm install

# Iniciar cliente (Vite) + servidor (Express)
npm run dev
```

- **Cliente:** http://localhost:5173  
- **API:** http://localhost:8080  

En localhost el cliente usa automáticamente el backend local. Si no tenés `SUPABASE_DATABASE_URL` en `.env`, usará SQLite (`server/data.db`).

---

## 2. GitHub

```bash
git add .
git commit -m "Actualizaciones: Kryptex, control documentos, parser estado"
git push origin main
```

Si el repo está conectado a Vercel, cada push a `main` dispara un deploy automático.

---

## 3. Vercel

### Opción A: Conectado a GitHub
Si el proyecto ya está en [vercel.com](https://vercel.com) vinculado al repo, cada `git push` despliega automáticamente.

### Opción B: Deploy manual
```bash
npm i -g vercel
vercel --prod
```

### Variables de entorno en Vercel
En **Project Settings → Environment Variables** configurá:

| Variable | Descripción |
|----------|-------------|
| `SUPABASE_DATABASE_URL` | Connection string de Supabase (URI). Obtener en: Supabase Dashboard → Project Settings → Database → Connection string (URI) |
| `JWT_SECRET` | Secreto largo para JWT (ej. 32+ caracteres aleatorios) |
| `CORS_ORIGIN` | `https://app.hashrate.space` o tu dominio |

---

## 4. Supabase

### Crear proyecto
1. Ir a [supabase.com](https://supabase.com) → New Project  
2. Elegir región y contraseña de la base de datos  

### Ejecutar schema
1. En el proyecto: **SQL Editor** → **New query**  
2. Copiar el contenido de `server/src/db/schema-supabase.sql`  
3. Ejecutar (Run)  

### Obtener connection string
1. **Project Settings** → **Database**  
2. En **Connection string** elegir **URI**  
3. Copiar la URI y reemplazar `[YOUR-PASSWORD]` por la contraseña del proyecto  
4. Pegar en `SUPABASE_DATABASE_URL` en Vercel  

Formato típico:
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

### Usuario inicial
Después de crear las tablas, insertar un usuario admin (en SQL Editor):

```sql
INSERT INTO users (username, email, password_hash, role)
VALUES ('admin', 'admin@ejemplo.com', '$2a$10$...', 'admin_a');
```

El `password_hash` debe ser bcrypt. Podés generarlo con:
```bash
node -e "console.log(require('bcryptjs').hashSync('tu_password', 10))"
```

---

## Resumen rápido

| Paso | Comando / Acción |
|------|------------------|
| Localhost | `npm run dev` |
| GitHub | `git add . && git commit -m "..." && git push` |
| Vercel | Auto-deploy si está conectado, o `vercel --prod` |
| Supabase | Ejecutar `schema-supabase.sql` + configurar `SUPABASE_DATABASE_URL` en Vercel |
