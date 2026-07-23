import { GET as getSummary } from "@/app/api/staff-performance/summary/route";
import { jsonError } from "@/lib/api/http";

export const runtime = "nodejs";

export const GET = getSummary;

export async function POST() {
  return methodNotAllowed();
}

export async function PUT() {
  return methodNotAllowed();
}

export async function PATCH() {
  return methodNotAllowed();
}

export async function DELETE() {
  return methodNotAllowed();
}

function methodNotAllowed() {
  return jsonError("Staff Performance is read-only.", 405);
}
