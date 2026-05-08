import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { exportBusinessBackup } from "@/lib/operations/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId") ?? undefined;
    const access = businessId ? await requireBusinessAccess(user.id, "backup:read", businessId) : null;
    const gated = access ? await requireFeatureAccess(user.id, access.businessId, "basic_exports") : null;

    if (gated) {
      return gated;
    }

    const backup = await exportBusinessBackup(user.id, businessId);
    const rows = [
      ["exportedAt", backup.exportedAt],
      ["businessName", backup.business.name],
      ["accounts", String(backup.business.accounts.length)],
      ["transactions", String(backup.business.transactions.length)],
      ["customers", String(backup.business.customers.length)],
      ["suppliers", String(backup.business.suppliers.length)],
      ["debts", String(backup.business.debts.length)],
      ["inventoryItems", String(backup.business.items.length)],
      [
        "disclaimer",
        "Automatically generated from recorded business data. Please verify before official submission or filing.",
      ],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="accountant-export-${backup.exportedAt.slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not export accountant pack.");
  }
}
