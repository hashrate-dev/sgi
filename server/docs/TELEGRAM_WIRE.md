# Telegram: avisos del Wire cripto (sala de redacción)

Cuando el bot inserta **noticias nuevas**, el servidor puede mandarte un **resumen por Telegram** al chat configurado en la UI (engranaje → «Telegram · avisos del bot»).

No reenvía el historial: solo lo nuevo de esa captura.

## Setup rápido

### 1) Crear el bot

1. Abrí Telegram y hablá con [`@BotFather`](https://t.me/BotFather).
2. `/newbot` → elegí nombre y username.
3. Copiá el **token** (ej. `7123456789:AAH...`).

### 2) Variable en Vercel

```env
TELEGRAM_BOT_TOKEN=7123456789:AAH...
TELEGRAM_BOT_USERNAME=tu_bot_hrs   # opcional, sin @
# TELEGRAM_CHAT_ID=123456789       # opcional (fallback si la UI no tiene chat)
```

Redeploy después de guardar.

### 3) Vincular tu chat

1. Abrí tu bot en Telegram y mandá `/start`.
2. En SGI → sala de redacción → engranaje → **Detectar chats** (o pegá el Chat ID a mano).
3. Activá el toggle, **Guardar Telegram**, **Enviar prueba**.

Tip: también podés usar [@userinfobot](https://t.me/userinfobot) para ver tu id numérico.

## Qué se envía

Un mensaje de texto con hasta ~5 títulos nuevos + link a la sala:

`/gestion-administrativa/noticias`

## Seguridad

- No subas `TELEGRAM_BOT_TOKEN` al repo.
- El toggle y el `chat_id` viven en `sgi_crypto_noticias_tg`.
