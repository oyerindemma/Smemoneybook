export type Phase2Feature =
  | "locations"
  | "transfers"
  | "reportingCentre"
  | "pdfExports"
  | "tax"
  | "invoiceBranding"
  | "i18n"
  | "granularPermissions"
  | "announcements"
  | "businessSwitcher";

export const phase2FeatureFlags: Record<Phase2Feature, boolean> = {
  locations: readFlag(process.env.NEXT_PUBLIC_PHASE2_LOCATIONS_ENABLED, false),
  transfers: readFlag(process.env.NEXT_PUBLIC_PHASE2_TRANSFERS_ENABLED, false),
  reportingCentre: readFlag(process.env.NEXT_PUBLIC_PHASE2_REPORTING_CENTRE_ENABLED, false),
  pdfExports: readFlag(process.env.NEXT_PUBLIC_PHASE2_PDF_EXPORTS_ENABLED, false),
  tax: readFlag(process.env.NEXT_PUBLIC_PHASE2_TAX_ENABLED, false),
  invoiceBranding: readFlag(process.env.NEXT_PUBLIC_PHASE2_INVOICE_BRANDING_ENABLED, false),
  i18n: readFlag(process.env.NEXT_PUBLIC_PHASE2_I18N_ENABLED, false),
  granularPermissions: readFlag(
    process.env.NEXT_PUBLIC_PHASE2_GRANULAR_PERMISSIONS_ENABLED,
    false,
  ),
  announcements: readFlag(process.env.NEXT_PUBLIC_PHASE2_ANNOUNCEMENTS_ENABLED, false),
  businessSwitcher: readFlag(process.env.NEXT_PUBLIC_PHASE2_BUSINESS_SWITCHER_ENABLED, false),
};

export function requirePhase2Feature(feature: Phase2Feature, label: string) {
  if (phase2FeatureFlags[feature]) {
    return null;
  }

  return Response.json(
    { error: `${label} is not available right now.` },
    { status: 404 },
  );
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
