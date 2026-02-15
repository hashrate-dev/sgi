# Conectar el proyecto con Supabase

1. **Crear un proyecto** en [Supabase](https://supabase.com) (Dashboard → New project).

2. **Crear las tablas**: en el dashboard de Supabase, abrí **SQL Editor** → **New query**, pegá todo el contenido de `schema.sql` de esta carpeta y ejecutá (Run). Eso crea las tablas: `clients`, `invoices`, `invoice_items`, `users`, `user_activity`, `invoice_sequences`, `emitted_documents`, `emitted_garantias`, `items_garantia_ande`.

3. **Obtener la connection string**: en **Project Settings** → **Database** → **Connection string**, elegí **URI** y copiá la URL (modo Transaction o Session). El formato es:
   ```text
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
   ```
   Reemplazá `[YOUR-PASSWORD]` por la contraseña de la base de datos del proyecto.

4. **Configurar el servidor**: en la raíz del proyecto (o en `server/`) creá o editá el archivo `.env` y agregá:
   ```env
   SUPABASE_DATABASE_URL=postgresql://postgres.xxxx:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   (con tu URL real).

5. **Reiniciar el servidor**: al levantar el backend con `npm run dev` (o `npm run start`), si `SUPABASE_DATABASE_URL` está definida, la app usará Supabase (PostgreSQL) en lugar de SQLite. Si no está definida, se sigue usando SQLite como hasta ahora.

## Notas

- Los **usuarios** (login) hay que crearlos desde la app (Gestión de usuarios) o insertarlos en la tabla `users` en Supabase; el script de `schema.sql` no crea usuarios por defecto.
- La columna de facturas se llama `"clientName"` (entre comillas en PostgreSQL) para mantener compatibilidad con el código existente.
