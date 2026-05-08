import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import type { AutomationSuggestion } from "@/lib/automation/automation-types";

export async function logAutomationSuggestion(suggestion: AutomationSuggestion) {
  const existing = await getPrisma().automationLog.findFirst({
    where: {
      businessId: suggestion.businessId,
      type: suggestion.type,
      metadata: {
        path: ["idempotencyKey"],
        equals: suggestion.idempotencyKey,
      },
    },
  });

  if (existing) {
    return { created: false, log: existing };
  }

  const log = await getPrisma().automationLog.create({
    data: {
      businessId: suggestion.businessId,
      type: suggestion.type,
      status: "suggested",
      message: suggestion.message,
      metadata: {
        idempotencyKey: suggestion.idempotencyKey,
        ...suggestion.metadata,
      } as Prisma.InputJsonObject,
    },
  });

  return { created: true, log };
}

export async function logAutomationFailure(businessId: string, type: string, error: unknown) {
  return getPrisma().automationLog.create({
    data: {
      businessId,
      type,
      status: "failed",
      message: error instanceof Error ? error.message.slice(0, 240) : "Automation failed.",
    },
  });
}
