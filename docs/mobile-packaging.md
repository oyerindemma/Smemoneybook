# Mobile Packaging

SME Moneybook uses a Capacitor wrapper around the existing Next.js app.

## Deployment Target

Android is the first mobile deployment target. iOS should be added after the Android WebView auth/session flow is verified against staging or production.

## Why Hosted Next.js

The app uses Next.js API routes, Prisma, and HTTP-only auth cookies, so the mobile WebView must load a live Next.js origin. Do not treat this as a static export unless the API/data layer is moved elsewhere.

## Local Android Development

The wrapper is pinned to Capacitor 7 because the current workspace runs Node 20. Capacitor 8 requires Node 22.

1. Start the web app:
   ```bash
   npm run dev
   ```
2. Sync the Android project for the emulator:
   ```bash
   npm run mobile:android:dev
   ```

The default Capacitor URL is `http://10.0.2.2:3000`, which maps the Android emulator to the host machine. For a real device or staging build, set:

```bash
CAPACITOR_SERVER_URL=https://your-staging-or-production-domain.com npm run mobile:sync
```

Android debug builds allow cleartext traffic for local emulator testing only. Release builds should use an HTTPS `CAPACITOR_SERVER_URL`.

## Build Requirements

Install Android Studio, Android SDK, and a Java runtime before building the native app:

```bash
cd android
./gradlew assembleDebug
```

## Auth Cookie Check

Auth currently uses the HTTP-only `sme_moneybook_session` cookie with `sameSite: "lax"`, `path: "/"`, and `secure` enabled in production. This is compatible with a Capacitor WebView when the app loads the same HTTPS origin that sets the cookie.

Before release, verify on a real Android device:

- Register or sign in from the WebView.
- Close and reopen the app.
- Confirm `/api/dashboard/summary` still sees the session cookie.
- Confirm logout clears the session.

Avoid mixing a WebView origin and API origin unless cookie domain, `SameSite`, and secure settings are deliberately redesigned.

## Security Headers

The Next.js app sets baseline security headers globally:

- Content Security Policy with `frame-ancestors 'none'`.
- `X-Frame-Options: DENY`.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Restrictive `Permissions-Policy`.
- HSTS in production.

Development builds keep the minimum extra CSP allowances needed for local Next.js/Turbopack workflows. Production removes `unsafe-eval` and plain HTTP/WebSocket connect sources.

## PWA and Mobile Metadata

The app includes:

- `src/app/manifest.ts` for the web manifest.
- Mobile icons in `public/icons`.
- Apple touch icon at `public/apple-touch-icon.png`.
- Theme color and standalone Apple web app metadata in `src/app/layout.tsx`.
- `viewport-fit=cover` and safe-area CSS support for mobile browser and WebView edges.

## Offline Queue Decision

Do not add a broad service worker cache for financial data.

Reason: SME Moneybook handles financial records, HTTP-only auth cookies, and server-backed business state. A broad offline cache could show stale balances or leak sensitive data if not designed carefully.

For core writes, use the narrow local operation queue:

- The dashboard shell shows visible offline/refresh status.
- Users can retry refresh after reconnecting.
- Sales, expenses, and stock movements receive client operation ids and queue locally if the connection drops.
- Server endpoints use idempotency keys so replay does not duplicate money or stock records.
- The UI shows pending-sync count and retry state.
- Do not cache full dashboard responses in a service worker.

Future work: move queued payloads from `localStorage` to encrypted device storage in native wrappers, add admin review for conflicts, and expose failed sync operations from `OfflineSyncOperation`.
