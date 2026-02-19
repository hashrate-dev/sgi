# Conectar el backend con Supabase

Proyecto: **https://supabase.com/dashboard/project/cvzkjjzwnzwbopvsnqwi**

## Cómo enchufar todo (paso a paso)

### 1. Contraseña de la base de datos

- Entrá a **https://supabase.com/dashboard/project/cvzkjjzwnzwbopvsnqwi**
- **Project Settings** (ícono de engranaje) → **Database**
- En **Database password**: si no la recordás, hacé **Reset database password**, guardala en un lugar seguro (es la contraseña del usuario `postgres` de PostgreSQL, no la de tu cuenta Supabase).

### 2. Copiar la connection string

- En la misma página **Database**, bajá hasta **Connection string**
- Elegí la pestaña **URI**
- Copiá la URI. Puede ser:
  - **Direct** (puerto 5432): `postgresql://postgres:[YOUR-PASSWORD]@db.cvzkjjzwnzwbopvsnqwi.supabase.co:5432/postgres`
  - **Connection pooling** (puerto 6543): algo como `postgresql://postgres.cvzkjjzwnzwbopvsnqwi:[YOUR-PASSWORD]@aws-0-xx.pooler.supabase.com:6543/postgres`
- Reemplazá **`[YOUR-PASSWORD]`** por la contraseña del paso 1 (sin espacios, tal cual).

### 3. Poner la URL en el servidor

**Opción A — Script (recomendado):**
```bash
npm run supabase:set -- "postgresql://postgres:TU_PASSWORD@db.cvzkjjzwnzwbopvsnqwi.supabase.co:5432/postgres"
```
(Reemplazá por tu URI real de Supabase.)

**Opción B — Manual:** Abrí **`server/.env`** y agregá (o descomentá):
```env
SUPABASE_DATABASE_URL=postgresql://postgres:TU_PASSWORD_REAL@db.cvzkjjzwnzwbopvsnqwi.supabase.co:5432/postgres
```

### 4. Arrancar el servidor

- En la raíz del proyecto: **`npm run dev`**
- La primera vez que arranque con `SUPABASE_DATABASE_URL` definida, el backend creará las tablas en Supabase (ejecuta `server/src/db/schema-supabase.sql`).
- En la consola deberías ver: **`[DB] Conectado a Supabase (PostgreSQL)`**. Si ves "Usando SQLite local", no está conectado.
- Verificá en **http://localhost:8080/api/db-info** — debe decir `"db": "supabase"`.
- Abrí **http://localhost:5173** y logueate con **jv@hashrate.space** / **admin123** (esos usuarios se crean en Supabase al hacer el primer login).

### 5. Si algo falla

- **"password authentication failed"**: la contraseña en la URI no es la de **Database password** en Supabase. Resetearla y actualizar `.env`.
- **Tablas no existen**: podés crear todo a mano en Supabase → **SQL Editor** → New query → pegar el contenido de **`server/src/db/schema-supabase.sql`** → Run.

---

## Volver a SQLite (localhost sin Supabase)

En **`server/.env`**, comentá de nuevo la línea:

```env
# SUPABASE_DATABASE_URL=postgresql://...
```

Y reiniciá **`npm run dev`**. El backend usará otra vez **`server/data.db`**.
