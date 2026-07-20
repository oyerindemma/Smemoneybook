# SME MoneyBook Phase 3H Tax Assistant

Status: implemented as a gated foundation on `phase-3-staging`.

Tax Assistant is a recordkeeping and preparation tool. It estimates from recorded SME MoneyBook data and configured tax settings. It is not tax advice, filing confirmation, legal advice, or a guarantee.

## Implemented Scope

- Feature-gated by `NEXT_PUBLIC_PHASE3_TAX_ASSISTANT_ENABLED`.
- API:
  - `GET /api/tax-assistant` calculates a summary for a period.
  - `POST /api/tax-assistant` recalculates and saves a snapshot.
- Access controls:
  - authenticated user
  - business membership
  - `reports:write` permission
  - optional location access when `locationId` is supplied
  - Growth-or-higher active plan
  - existing `tax_management` entitlement
- Rule version: `tax-assistant-ng-v1`.
- Snapshot table: `TaxAssistantSnapshot`.
- Additive migration only: `20260719093000_phase_3_tax_assistant`.
- More page route: `/more/tax-assistant`.
- Audit event: `tax_assistant.snapshot_saved`.

## Inputs

- `TaxConfig`
- `TaxRate`
- `Transaction`
- `DocumentTaxSnapshot`
- prior `TaxRun`

## Output

- configured country
- confidence
- taxable sales
- estimated tax
- configured rates
- missing settings
- inconsistencies
- reminders
- accountant export summary
- source metrics
- disclaimer

## Safeguards

- No automatic tax filing.
- No tax/legal guarantee.
- Country-specific foundation is Nigeria-only (`NG`) until additional versioned rules are reviewed.
- Missing settings return low/insufficient confidence.
- Sales without document tax snapshots are flagged.
- Current-rate differences from historical document snapshots are flagged.

## Remaining Work

- Versioned effective-date tax rules per country.
- Deadline configuration per business and country.
- Accountant-ready export UI.
- Tax professional escalation link.
- Historical tax snapshot comparison.
- Legal review before any filing integration.

Phase 3H is ready for internal flagged QA, not broad Production activation.
