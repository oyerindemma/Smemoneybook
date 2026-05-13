import { listAutomationBusinessIds, runAutomationForBusiness } from "@/lib/automation/automation-jobs";

const automationConcurrency = 10;

export async function runAutomation() {
  const businessIds = await listAutomationBusinessIds();
  const results = [];

  for (let index = 0; index < businessIds.length; index += automationConcurrency) {
    const batch = businessIds.slice(index, index + automationConcurrency);
    results.push(...(await Promise.all(batch.map(runAutomationForBusiness))));
  }

  return {
    ok: true,
    businessCount: businessIds.length,
    results,
  };
}
