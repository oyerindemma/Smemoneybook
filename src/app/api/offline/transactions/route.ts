import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

export async function POST() {
  return jsonError(
    "Offline transaction queue is disabled for v1. Reconnect before saving money changes.",
    410,
  );
}
