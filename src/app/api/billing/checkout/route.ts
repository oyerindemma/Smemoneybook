import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST() {
  return jsonError("Use /api/paystack/initialize for secure billing checkout.", 410);
}
