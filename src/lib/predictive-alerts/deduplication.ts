import type { PredictiveAlertCategory } from "@/lib/predictive-alerts/definitions";

export function buildPredictiveAlertDedupeKey({
  businessId,
  locationId,
  ruleKey,
  category,
  entityKey = "business",
}: {
  businessId: string;
  locationId?: string | null;
  ruleKey: string;
  category: PredictiveAlertCategory;
  entityKey?: string | null;
}) {
  return [
    "phase3e",
    businessId,
    locationId || "all",
    category,
    ruleKey,
    normalizeKeyPart(entityKey || "business"),
  ].join(":");
}

function normalizeKeyPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "business";
}
