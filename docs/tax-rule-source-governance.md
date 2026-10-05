# Tax Rule Source Governance

Tax Assistant rules are configuration, not hard-coded legal advice. Every rule must be reviewable, versioned and traceable before it can produce a definitive estimate.

## Required Rule Fields

Each rule set must include:

- jurisdiction
- version
- effective start date
- optional effective end date
- source title
- source authority
- source publication date
- source reference
- last verified date
- verification owner
- status: `draft`, `verified`, or `deprecated`

Each rule must include:

- jurisdiction
- tax type
- transaction type
- effective start date
- optional effective end date
- rate or formula
- threshold
- source title
- source authority
- source publication date
- source reference
- last verified date
- verification owner
- status: `draft`, `verified`, or `deprecated`

## Source Hierarchy

1. Enacted Nigerian legislation and official gazettes.
2. Nigeria Revenue Service or relevant state tax authority pages, circulars, notices and official portals.
3. Federal Ministry of Finance regulations and official publications.
4. Secondary professional summaries only as non-authoritative implementation notes.

Unofficial blogs must not be used as authoritative law.

## Verification Workflow

1. Add or update the rule set in a migration or admin-reviewed data-change script.
2. Record the official source reference and publication date.
3. Compare the rate, threshold, formula and effective date against the source.
4. Mark the rule as `verified` only after review by the listed verification owner.
5. If a source cannot be verified, keep the rule `draft` and make the product show `Tax rule requires verification`.
6. Deprecate old rules instead of overwriting historical configuration.

## Current Phase 3C Preview Rule Set

Version: `ng-federal-2026-preview-v1`

Jurisdiction: `NG-FED`

Status: `verified`

Verification owner: `SME MoneyBook engineering`

Last verified date: `2026-07-23`

Official references:

- Nigeria Revenue Service official site: https://www.nrs.gov.ng/
- Nigeria Tax Act 2025 PDF hosted by NRS: https://www.nrs.gov.ng/uploads/NIGERIA_TAX_ACT_2025_ef6bb812a5.pdf
- NRS withholding-tax page: https://www.nrs.gov.ng/page/withholding-tax
- TaxPro Max filing portal: https://taxpromax.firs.gov.ng/

Configured deterministic rules:

- Standard VAT estimate for taxable Nigerian supplies: `7.5%`, effective `2026-01-01`, sourced to the Nigeria Tax Act 2025 reference.
- Input VAT estimate: same standard VAT rate, applied only to recorded eligible expenses and shown as an estimate.
- WHT position: recorded-only rule. The engine totals explicit WHT amounts/rates stored on transactions and flags missing WHT treatment for review. It does not infer category-specific statutory WHT rates from ambiguous descriptions.

## Product Behavior

- Verified rules allow deterministic estimates.
- Draft or missing rules block definitive estimates and display `Tax rule requires verification`.
- Every Tax Assistant response must identify the rule-set version.
- Every estimate must distinguish recorded facts, calculated estimates, missing data, suggested review actions and professional-advice boundaries.
