export type AiMarketingDeliveryStatus = {
  enabled: boolean;
  status: "disabled" | "setup_required";
  provider: string | null;
  message: string;
};

export function getAiMarketingDeliveryStatus(): AiMarketingDeliveryStatus {
  const enabled = isAiMarketingSendingEnabled();

  return {
    enabled,
    status: enabled ? "setup_required" : "disabled",
    provider: null,
    message: enabled
      ? "Outbound marketing delivery needs an approved messaging provider before sending."
      : "Outbound AI Marketing sending is disabled for this Preview release.",
  };
}

export function isAiMarketingSendingEnabled() {
  return (
    readFlag(process.env.PHASE3_AI_MARKETING_SENDING_ENABLED, false) &&
    readFlag(process.env.PHASE3_AI_MARKETING_ENABLED, false) &&
    !readFlag(process.env.PHASE3_AI_GLOBAL_KILL_SWITCH, false)
  );
}

function readFlag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
