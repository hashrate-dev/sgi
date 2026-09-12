# WhatsApp: avisos del Wire cripto (sala de redacción)

Cuando el bot inserta **noticias nuevas** (botón «Actualizar bot ahora», cron horario o auto-ingest), el servidor puede mandarte un **resumen por WhatsApp** al número configurado en la UI (engranaje → «WhatsApp · avisos del bot»).

No reenvía el historial: solo lo que acaba de entrar en esa captura.

## Cómo activarlo (UI)

1. Entrá a `/gestion-administrativa/noticias`.
2. Abrí el engranaje (configuración).
3. Marcá **Enviar noticias nuevas del bot por WhatsApp**.
4. Poné tu número con código de país, solo dígitos (ej. `595991907308`).
5. **Guardar WhatsApp** y después **Enviar prueba**.

Si el teléfono en la UI está vacío, se usa como respaldo `WHATSAPP_NOTIFY_TO` (el mismo de órdenes marketplace).

## Canal 1 — CallMeBot (recomendado, texto libre)

No necesita plantilla de Meta. Ideal para alertas personales.

1. Seguí [CallMeBot · Free API WhatsApp](https://www.callmebot.com/blog/free-api-whatsapp-messages/).
2. Obtené tu `apikey`.
3. En Vercel / `.env` del server:

```env
WHATSAPP_CALLMEBOT_APIKEY=tu_apikey
```

Si esta variable está definida, el wire **la usa primero** (mensaje de texto con títulos + link a la sala).

## Canal 2 — Meta Cloud API (plantilla)

Si no hay CallMeBot, se reutilizan:

```env
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

y hace falta una **plantilla aprobada** (los avisos iniciados por el negocio no pueden ser texto libre fuera de la ventana de 24 h).

| Variable | Default |
|----------|---------|
| `WHATSAPP_NEWS_TEMPLATE_NAME` | `nueva_noticia_wire` |
| `WHATSAPP_NEWS_TEMPLATE_LANG` | `WHATSAPP_TEMPLATE_LANG` o `es` |

### Cuerpo de la plantilla (exactamente 3 variables)

```text
Wire cripto HRS · {{1}} noticia(s) nueva(s)

{{2}}

Sala: {{3}}
```

- `{{1}}` = cantidad (ej. `3`)
- `{{2}}` = listado corto de títulos (separados por ` | `)
- `{{3}}` = URL de la sala (`APP_PUBLIC_URL` + `/gestion-administrativa/noticias`)

Categoría sugerida: **Utility**.

## Prioridad de envío

1. `WHATSAPP_CALLMEBOT_APIKEY` → CallMeBot  
2. Si no: Meta Cloud + plantilla `nueva_noticia_wire`  
3. Si falta todo: no envía (el ingest sigue OK; mirá logs `[crypto-noticias] WhatsApp wire`)

## Seguridad

- No subas tokens ni apikeys al repo.
- El toggle y el número viven en `sgi_crypto_noticias_wa` (DB); las claves van en env del server.
