# Paystack Billing Setup

SME Moneybook uses Paystack for secure plan checkout. The frontend only redirects to Paystack; subscriptions activate only after server-side verification or a signed Paystack webhook.

## Environment Variables

Set these in local, staging, and production:

```env
PAYSTACK_PUBLIC_KEY=pk_test_xxx
PAYSTACK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

Use test keys for staging and live keys only for production.

## Webhook URL

In the Paystack dashboard, add:

```text
https://your-domain.com/api/paystack/webhook
```

Events handled:

- `charge.success`

The route verifies `x-paystack-signature` with `PAYSTACK_SECRET_KEY` before processing.

## Deployment Checklist

- Run `npx prisma migrate deploy` against production Neon.
- Confirm `NEXT_PUBLIC_APP_URL` is HTTPS in production.
- Confirm Paystack test payment succeeds before switching to live keys.
- Confirm duplicate webhook deliveries do not create duplicate activations.
- Do not show billing upgrade CTAs in production until Paystack live keys and webhook URL are configured.
