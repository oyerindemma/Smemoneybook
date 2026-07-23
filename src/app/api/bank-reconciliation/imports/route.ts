import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  bankReconciliationErrorResponse,
  parseBankReconciliationImportRequest,
} from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import {
  importBankStatementForBusiness,
  listBankReconciliationImports,
} from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

const importRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business.")),
  accountId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  bankProfileId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  accountLabel: z.preprocess((val) => val ?? "", z.string().trim().max(120)).optional(),
  bankName: z.preprocess((val) => val ?? "", z.string().trim().max(120)).optional(),
  fileName: z.preprocess((val) => val ?? "", z.string().trim().max(240)).optional(),
  fileSize: z.coerce.number().int().positive().optional(),
  currency: z.preprocess((val) => val ?? "NGN", z.string().trim().min(3).max(3)).optional(),
  openingBalance: z.coerce.number().finite().optional(),
  closingBalance: z.coerce.number().finite().optional(),
  csv: z.string().min(10, "Upload a CSV statement file."),
  mapping: z.record(z.string(), z.string()).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.imports", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseBankReconciliationImportRequest(request.url);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "bank_reconciliation:read",
    });
    const imports = await listBankReconciliationImports({ businessId: access.businessId });
    return Response.json({ imports });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not load bank reconciliation imports.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.import", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, importRequestSchema);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: body.businessId,
      locationId: body.locationId || undefined,
      permission: "bank_reconciliation:import",
    });
    const result = await importBankStatementForBusiness({
      businessId: access.businessId,
      userId: user.id,
      csv: body.csv,
      fileName: body.fileName || undefined,
      fileSize: body.fileSize,
      accountId: body.accountId || undefined,
      locationId: access.locationId,
      bankProfileId: body.bankProfileId || undefined,
      accountLabel: body.accountLabel || undefined,
      bankName: body.bankName || undefined,
      currency: body.currency || undefined,
      openingBalance: body.openingBalance,
      closingBalance: body.closingBalance,
      mapping: body.mapping,
    });

    return Response.json(result);
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not import bank statement.");
  }
}
