import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  BankReconciliationDomainError,
  bankReconciliationErrorResponse,
  parseBankReconciliationImportRequest,
} from "@/lib/bank-reconciliation/api";
import { requireBankReconciliationAccess } from "@/lib/bank-reconciliation/authorization";
import {
  confirmBankReconciliationMatch,
  getBankReconciliationImport,
  importBankStatementForBusiness,
  listBankReconciliationImports,
  lockBankStatementImport,
  rejectBankReconciliationMatch,
  reopenBankStatementImport,
} from "@/lib/bank-reconciliation/service";

export const runtime = "nodejs";

const importRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business.")),
  accountId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  fileName: z.preprocess((val) => val ?? "", z.string().trim().max(240)).optional(),
  csv: z.string().min(10, "Upload a CSV statement file."),
});

const actionRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business.")),
  importId: z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a statement import.")),
  action: z.enum(["confirm_match", "reject_match", "lock_import", "reopen_import"]),
  matchId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  notes: z.preprocess((val) => val ?? "", z.string().trim().max(500)).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseBankReconciliationImportRequest(request.url);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "bank_reconciliation:read",
    });

    if (filters.importId) {
      const statementImport = await getBankReconciliationImport({
        businessId: access.businessId,
        importId: filters.importId,
      });

      if (!statementImport) {
        return Response.json({ error: "Bank statement import was not found." }, { status: 404 });
      }

      return Response.json({ import: statementImport });
    }

    const imports = await listBankReconciliationImports({ businessId: access.businessId });
    return Response.json({ imports });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not load bank reconciliation.");
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
      accountId: body.accountId || undefined,
      locationId: access.locationId,
    });

    return Response.json(result);
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not import bank statement.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.action", 80, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const body = await parseJsonBody(request, actionRequestSchema);
    const access = await requireBankReconciliationAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: body.action === "lock_import" || body.action === "reopen_import"
        ? "bank_reconciliation:review"
        : "bank_reconciliation:match",
    });
    const result = await runLegacyReconciliationAction({
      businessId: access.businessId,
      userId: user.id,
      importId: body.importId,
      action: body.action,
      matchId: body.matchId,
      notes: body.notes || undefined,
    });

    return Response.json({ result, message: "Bank reconciliation updated." });
  } catch (error) {
    return bankReconciliationErrorResponse(error, "Could not update bank reconciliation.");
  }
}

async function runLegacyReconciliationAction({
  businessId,
  userId,
  importId,
  action,
  matchId,
  notes,
}: {
  businessId: string;
  userId: string;
  importId: string;
  action: "confirm_match" | "reject_match" | "lock_import" | "reopen_import";
  matchId?: string;
  notes?: string;
}) {
  if (action === "confirm_match") {
    if (!matchId) {
      throw new BankReconciliationDomainError("Choose a match to confirm.", 400, "match_required");
    }

    return confirmBankReconciliationMatch({ businessId, userId, matchId, notes });
  }

  if (action === "reject_match") {
    if (!matchId) {
      throw new BankReconciliationDomainError("Choose a match to reject.", 400, "match_required");
    }

    return rejectBankReconciliationMatch({ businessId, userId, matchId, notes });
  }

  if (action === "lock_import") {
    return lockBankStatementImport({ businessId, userId, importId });
  }

  return reopenBankStatementImport({ businessId, userId, importId });
}
