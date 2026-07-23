import { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  bankReconciliationErrorResponse,
  logBankReconciliationEvent,
} from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import { previewBankStatementForBusiness } from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

const previewRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business.")),
  csv: z.string().min(10, "Upload a CSV statement file."),
  mapping: z.record(z.string(), z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.preview", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, previewRequestSchema);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: "bank_reconciliation:import",
    });
    const preview = await previewBankStatementForBusiness({
      businessId: access.businessId,
      csv: body.csv,
      mapping: body.mapping,
    });

    await logBankReconciliationEvent({
      access,
      action: "bank_reconciliation.import_previewed",
      message: "Bank statement import previewed.",
      metadata: {
        rowCount: preview.rowCount,
        duplicateRowCount: preview.duplicateRowCount,
        crossImportDuplicateCount: preview.crossImportDuplicateCount,
      } as Prisma.InputJsonObject,
    });

    return Response.json({ preview });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not preview bank statement.");
  }
}
