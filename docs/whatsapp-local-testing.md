# WhatsApp Local Testing

Use ngrok to expose the local Next.js dev server to Meta while testing WhatsApp webhooks.

1. Start SME MoneyBook locally:

```bash
npm run dev
```

2. Expose port 3000:

```bash
ngrok http 3000
```

3. In Meta for Developers, open your WhatsApp app webhook settings and use:

```text
Callback URL: https://YOUR-NGROK-DOMAIN.ngrok-free.app/api/webhooks/whatsapp
Verify token: the same value as WHATSAPP_WEBHOOK_VERIFY_TOKEN
```

4. Subscribe to WhatsApp message events:

```text
messages
message_status
```

5. Send a test message from a registered WhatsApp test number, then check:

```bash
npm run dev
```

The dev server logs should show webhook activity, and `WhatsAppEvent` rows should be written to Postgres.

Never put `WHATSAPP_ACCESS_TOKEN` in client code, public env vars, screenshots, or support messages.
