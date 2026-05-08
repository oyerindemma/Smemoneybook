import { getCronSecret } from "@/lib/env";
import { jsonError } from "@/lib/api/http";
import { runAutomation } from "@/lib/automation/automation-runner";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const expected = getCronSecret();
    const auth = request.headers.get("authorization");
    const secret = new URL(request.url).searchParams.get("secret");

    if (auth !== `Bearer ${expected}` && secret !== expected) {
      return jsonError("Unauthorized cron request.", 401);
    }

    const result = await runAutomation();
    return Response.json(result);
  } catch (error) {
    console.error("automation.cron_failed", error);
    return jsonError("Automation could not run.", 500);
  }
}
