import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { exportBusinessBackup } from "@/lib/operations/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const backup = await exportBusinessBackup(user.id);
    const rows = [
      ["exportedAt", backup.exportedAt],
      ["businessName", backup.business.name],
      ["accounts", String(backup.business.accounts.length)],
      ["transactions", String(backup.business.transactions.length)],
      ["customers", String(backup.business.customers.length)],
      ["suppliers", String(backup.business.suppliers.length)],
      ["debts", String(backup.business.debts.length)],
      ["inventoryItems", String(backup.business.items.length)],
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
