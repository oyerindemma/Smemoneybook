import { collectAutomationTriggers } from "@/lib/automation/triggers";
import { runWithRetry } from "@/lib/queue";

export type AutomationJobResult = {
  ruleType: string;
  ok: boolean;
  deduped?: boolean;
  error?: string;
};

export async function runBusinessAutomation(businessId: string): Promise<AutomationJobResult[]> {
  const rules = await collectAutomationTriggers(businessId);

  return Promise.all(
    rules.map(async (rule) => {
      const result = await runWithRetry(
        {
          id: `${businessId}:${rule.type}:${JSON.stringify(rule)}`,
          type: rule.type,
          payload: rule,
          dedupeKey: `${businessId}:${rule.type}:${JSON.stringify(rule)}`,
          maxAttempts: 3,
        },
        async () => {
          console.info("automation.rule.ready", { businessId, rule });
        },
      );

      return {
        ruleType: rule.type,
        ok: result.ok,
        deduped: "deduped" in result ? result.deduped : false,
        error: "error" in result ? result.error : undefined,
      };
    }),
  );
}
