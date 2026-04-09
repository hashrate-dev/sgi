-- Ejecutar en Supabase → SQL Editor si la tabla items_garantia_ande no existe
-- (mismo esquema que server/src/db/schema-supabase.sql líneas 98-106)

CREATE TABLE IF NOT EXISTS items_garantia_ande (
  id TEXT PRIMARY KEY,
  codigo TEXT NOT NULL,
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  fecha_ingreso TEXT NOT NULL,
  observaciones TEXT,
  precio_garantia DOUBLE PRECISION
);

ALTER TABLE items_garantia_ande ADD COLUMN IF NOT EXISTS precio_garantia DOUBLE PRECISION;
