import { listAutomationBusinessIds, runAutomationForBusiness } from "@/lib/automation/automation-jobs";

export async function runAutomation() {
  const businessIds = await listAutomationBusinessIds();
  const results = [];

  for (const businessId of businessIds) {
    results.push(await runAutomationForBusiness(businessId));
  }

  return {
    ok: true,
    businessCount: businessIds.length,
    results,
  };
}
