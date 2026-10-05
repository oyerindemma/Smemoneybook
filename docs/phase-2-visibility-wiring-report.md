# Phase 2 Visibility And Wiring Report

Date: 2026-07-17
Branch: `phase-2-staging`
Environment target: Vercel Preview for `phase-2-staging`

## Summary

Phase 2 backend foundations existed for most requested modules, but several features were invisible because:

- Phase 2 flags default to `false`.
- Vercel Preview did not list Phase 2 flag variables.
- Vercel Preview did not list Paystack test key variables.
- The dashboard payload did not expose active plan entitlements to client navigation.
- Locations, warehouses, tax, and staff invitations were backend/panel-only rather than clear routes.
- Reports existed but opened with the detailed report panel collapsed.

Production must remain default-off.

## Readiness Table

| Function | Schema/models | Migration | Service | API/action | Page/route | UI | Navigation | Permission | Entitlement | Tests | Classification |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Business Locations | Yes | Yes | Yes | Yes | Yes | Yes | More -> Business Settings -> Locations | Owner/admin location permission | `multi_location` | API/helper/e2e coverage | Complete, now wired |
| Warehouses | Yes via `BusinessLocation.type` | Yes | Yes | Yes | Yes | Yes | Stock -> Warehouses | Owner/admin location permission | `multi_location` | API/helper/e2e coverage | Complete, now wired |
| Warehouse Transfers | Yes | Yes | Yes | Yes | Yes | Yes | Stock -> Transfers | Transfer permissions | `warehouse_transfers` | API gate/helper/e2e coverage | Complete, now wired |
| Advanced Reports | Yes via report/export tables | Yes | Yes | Yes | Yes | Yes | More -> Reports | Reports permission | `advanced_reports`, export uses `professional_pdf_exports` | Report/export/helper/e2e coverage | Complete, now visible |
| Tax Management | Yes | Yes | Yes | Yes | Yes | Yes | More -> Business Settings -> Tax | Owner/admin | `tax_management` | API gate/helper coverage | Complete, now wired |
| Staff Invitation | Yes | Yes | Yes | Yes | Yes | Yes | More -> Staff -> Invite Staff | Owner/admin | `team_management` | Route tests updated | Complete, now wired |
| Paystack Checkout | Yes | Yes | Yes | Yes | Yes | Yes | More -> Billing -> Upgrade Plan | Owner/admin | Billing path must remain accessible before upgrade | Billing tests existing | Complete, needs Preview env |

## Preview Feature Flags

Set these to `true` for the `phase-2-staging` Preview environment only:

```env
NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED=true
NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED=true
NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED=true
NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED=true
NEXT_PUBLIC_PHASE2_TAX_ENABLED=true
NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED=true
NEXT_PUBLIC_PHASE2_I18N_ENABLED=true
NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED=true
NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED=true
NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED=true
```

## Preview Paystack Variables

Set these for Preview on `phase-2-staging`; use Paystack test keys only:

```env
PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_APP_URL=https://<phase-2-staging-preview-url>
```

Existing Paystack plan code variables can remain shared across Preview/Production if they point to safe plan codes. Preview currently needs the key pair and app URL to make `/api/billing/status` return billing live.

## Navigation Paths

| Function | Exact path |
|---|---|
| Business Locations | `/more` -> Business Settings -> `/more/business-settings/locations` |
| Warehouses | `/stock` -> Warehouses -> `/stock/warehouses` |
| Warehouse Transfers | `/stock` -> Transfers -> `/stock/transfers` |
| Advanced Reports | `/more` -> Reports -> `/reports` |
| Tax Management | `/more` -> Business Settings -> `/more/business-settings/tax` |
| Staff Invitation | `/more` -> Staff -> `/more/staff` |
| Paystack Checkout | `/more` -> Billing -> `/more/billing` |

## Routes Created Or Changed

- `src/app/(dashboard)/more/business-settings/page.tsx`
- `src/app/(dashboard)/more/business-settings/locations/page.tsx`
- `src/app/(dashboard)/more/business-settings/tax/page.tsx`
- `src/app/(dashboard)/more/staff/page.tsx`
- `src/app/(dashboard)/stock/warehouses/page.tsx`
- `src/app/(dashboard)/stock/transfers/page.tsx`
- `src/app/api/staff/invitations/route.ts`
- `src/app/api/staff/invitations/[id]/resend/route.ts`
- `src/app/api/staff/invitations/[id]/revoke/route.ts`

## Authorization Notes

- Client navigation now checks flag + active plan entitlement + role permission.
- Server routes still enforce authorization independently.
- Staff invitation GET/resend/revoke require owner/admin business access and `team_management`.
- Locations and warehouses require server-side location permissions and `multi_location`.
- Transfers require server-side transfer permissions and `warehouse_transfers`.
- Tax settings require owner/admin access and `tax_management`.
- Paystack activation remains verification-gated and idempotent through `PaymentEvent`.

## Remaining Defects

- Preview env still needs Phase 2 flags and Paystack test keys set.
- Human QA is still needed for real Paystack test checkout, email delivery, and stock transfer lifecycle in Preview.
- Non-English translation copy still needs human review before broad activation.
- Printable warehouse transfer documents are not complete.

## Recommendation

Go for Phase 2 Preview QA after setting the Preview-only environment variables above and redeploying the `phase-2-staging` Preview build.

No-go for Production activation until Preview QA passes and Production flags remain disabled by default.
