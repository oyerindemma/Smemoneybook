export type Phase1Feature = "onboarding" | "pos" | "returns" | "help" | "offlineQueue";

export const phase1FeatureFlags: Record<Phase1Feature, boolean> = {
  onboarding: readFlag(process.env.NEXT_PUBLIC_PHASE1_ONBOARDING_ENABLED, true),
  pos: readFlag(process.env.NEXT_PUBLIC_PHASE1_POS_ENABLED, true),
  returns: readFlag(process.env.NEXT_PUBLIC_PHASE1_RETURNS_ENABLED, true),
  help: readFlag(process.env.NEXT_PUBLIC_PHASE1_HELP_ENABLED, true),
  offlineQueue: readFlag(process.env.NEXT_PUBLIC_PHASE1_OFFLINE_QUEUE_ENABLED, true),
};

export function requirePhase1Feature(feature: Phase1Feature, label: string) {
  if (phase1FeatureFlags[feature]) {
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
