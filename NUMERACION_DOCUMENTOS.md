# Sistema de numeración de documentos

## Resumen del análisis

### Hosting y ASIC (Facturas, Recibos, Nota de Crédito): ✅ Correcto

- **Tabla:** `invoice_sequences` (Factura, Recibo, Nota de Crédito)
- **Lógica:** `max(secuencia, max_en_invoices) + 1` dentro de una transacción
- **Flujo:** El número se asigna al crear la factura (POST /invoices), no antes
- **Vista previa:** Usa `peek=1` para no consumir números
- **Sin race conditions:** La asignación se hace en la misma transacción que el INSERT

### Garantías ANDE: ✅ Corregido

**Antes (problemas):**
- El cliente generaba el número con `nextValeNumber()` basado en solo los últimos 15 días
- Riesgo de duplicados si había documentos emitidos hace más de 15 días
- Race condition: dos usuarios podían obtener el mismo número

**Ahora (corregido):**
- **Tabla:** `garantia_sequences` (Recibo, Recibo Devolución)
- **Nuevo endpoint:** GET /api/garantias/next-number?type=Recibo|Recibo Devolución&peek=1
- **POST /garantias/emitted:** El servidor asigna el número en una transacción
- **Import Excel:** `preserveNumber: true` mantiene los números originales del historial

## Migración en Supabase

Si ya tenés el proyecto en Supabase, ejecutá en **SQL Editor**:

```sql
CREATE TABLE IF NOT EXISTS garantia_sequences (
  type TEXT PRIMARY KEY CHECK (type IN ('Recibo', 'Recibo Devolución')),
  last_number INTEGER NOT NULL DEFAULT 100
);
INSERT INTO garantia_sequences (type, last_number) VALUES ('Recibo', 100), ('Recibo Devolución', 200)
ON CONFLICT (type) DO NOTHING;
```

## Mejoras implementadas

1. **Garantías:** Numeración atómica en servidor con transacción
2. **Garantías:** Vista previa con `peek` sin consumir números
3. **Garantías:** Import histórico preserva números del Excel
4. **Hosting/ASIC:** Ya estaba bien (sin cambios)
