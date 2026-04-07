# WhatsApp: avisos de órdenes del carrito marketplace

Cuando un cliente confirma la **orden de compra** desde el carrito (`submit_ticket`), el servidor intenta enviar un mensaje de **plantilla** por la [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) al número configurado en `WHATSAPP_NOTIFY_TO` (por ejemplo tu línea `+595 991 907 308` u otro celular de ventas).

## Requisitos en Meta

1. Cuenta de **Meta for Developers** y app con producto **WhatsApp**.
2. **WhatsApp Business Account** y número conectado a la API (el mismo que usás en WhatsApp Business).
3. En la consola de la app: copiar **Token de acceso** (temporal o de sistema de larga duración) → `WHATSAPP_ACCESS_TOKEN`.
4. **ID del número de teléfono** (*Phone number ID*, no es el número visible) → `WHATSAPP_PHONE_NUMBER_ID`.

## Plantilla de mensaje (obligatoria)

Los mensajes iniciados por el negocio fuera de la ventana de 24 h deben usar una **plantilla aprobada**.

1. En **Administrador de WhatsApp** → Plantillas de mensajes → Crear plantilla.
2. **Nombre** (debe coincidir con `.env`): por defecto el código usa `nueva_orden_marketplace` (configurable con `WHATSAPP_TEMPLATE_NAME`).
3. **Idioma**: por ejemplo `Spanish` → en `.env` va `WHATSAPP_TEMPLATE_LANG=es` (debe coincidir con el código de idioma de la plantilla en Meta, ej. `es` o `es_LA`).
4. **Categoría**: **Utility** (recomendado para avisos transaccionales).
5. **Cuerpo** con **exactamente 4 variables** en este orden:

```text
Nueva orden de compra en el marketplace.

Orden: {{1}}
Ticket: {{2}}
Cliente: {{3}}
Total referencial: {{4}}
```

- `{{1}}` = número de orden (ej. ORD-0000002)  
- `{{2}}` = código de ticket (ej. TKT-XXXX)  
- `{{3}}` = email del cliente  
- `{{4}}` = total en texto (ej. 5.950,00 USD)  

Enviá la plantilla a **aprobación**. Hasta que no esté **Activa**, la API devolverá error (revisá logs del servidor: `[whatsapp] marketplace order notify:`).

## Variables de entorno (`server/.env`)

| Variable | Descripción |
|----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Token de la API de WhatsApp (Meta). |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número desde el que envía el negocio. |
| `WHATSAPP_NOTIFY_TO` | Quién recibe el aviso, solo dígitos: `595991907308`. |
| `WHATSAPP_TEMPLATE_NAME` | Nombre exacto de la plantilla (default `nueva_orden_marketplace`). |
| `WHATSAPP_TEMPLATE_LANG` | Código de idioma de la plantilla (default `es`). |
| `WHATSAPP_GRAPH_VERSION` | Opcional, default `v21.0`. |

Si falta token, phone ID o destino, **no se envía nada** y la orden se crea igual.

## Modo prueba (sandbox)

Mientras la app esté en desarrollo, solo podrás enviar a **números de prueba** agregados en el panel de desarrolladores de Meta. Agregá el número que debe recibir el aviso ahí.

## Seguridad

- No subas `WHATSAPP_ACCESS_TOKEN` al repositorio.
- Renová el token periódicamente o usá un token de larga duración según la guía de Meta.

## Si no llega el mensaje (ORD-xxx sí se crea)

1. **Mirá la consola del servidor** al **arrancar** el API:
   - Debe decir `Avisos de órdenes (marketplace): activos`. Si dice `no configurados`, las variables no están en el `.env` que realmente carga el proceso (recordá: el proyecto puede cargar `server/.env` y luego la raíz `../.env` según `server/src/config/env.ts`).
2. **Al generar la orden**, si hay error de Meta verás algo como `[whatsapp] marketplace order notify: WhatsApp API 400: ...` con el motivo (plantilla inexistente, idioma incorrecto, token vencido, etc.).
3. **Modo desarrollo / sandbox**: el número `WHATSAPP_NOTIFY_TO` suele tener que estar agregado como **número de prueba** en la app de Meta; si no, la API puede responder error o no entregar al dispositivo.
4. **Nombre e idioma de la plantilla** deben coincidir **exactamente** con Meta (`WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`). Si creaste la plantilla en “Spanish (PY)” el código puede ser `es_PY`, no `es`.
5. La **plantilla** tiene que estar en estado **Aprobada / Activa** y el cuerpo debe tener **4 variables** en el orden indicado arriba.
6. La IP `127.0.0.1` en el ticket **no afecta** el envío a WhatsApp: el servidor igual llama a `graph.facebook.com` por Internet.
7. Enviar desde tu línea de negocio **al mismo número** que la API no siempre es posible; probá con **otro celular** como `WHATSAPP_NOTIFY_TO` para descartar esa limitación.
