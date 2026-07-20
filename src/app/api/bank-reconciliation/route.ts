import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { requireMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess, requireLocationAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { requirePhase3Feature } from "@/lib/phase3/feature-flags";
import {
  confirmBankReconciliationMatch,
  getBankReconciliationImport,
  importBankStatementForBusiness,
  listBankReconciliationImports,
  lockBankStatementImport,
  rejectBankReconciliationMatch,
  reopenBankStatementImport,
} from "@/lib/phase3/bank-reconciliation-service";

export const runtime = "nodejs";

const importRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  accountId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  locationId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  fileName: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  csv: z.string().min(10, "Upload a CSV statement file."),
});

const actionRequestSchema = z.object({
  businessId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a business.")),
  importId: z.preprocess((val) => val ?? "", z.string().min(1, "Choose a statement import.")),
  action: z.enum(["confirm_match", "reject_match", "lock_import", "reopen_import"]),
  matchId: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
  notes: z.preprocess((val) => val ?? "", z.string().trim()).optional(),
});

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("bankReconciliation", "Bank reconciliation");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "bank_reconciliation.read", 120, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("businessId") ?? undefined;
    const importId = searchParams.get("importId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "money:write", businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to use Bank Reconciliation.",
    );

    if (planGate) {
      return planGate;
    }

    if (importId) {
      const statementImport = await getBankReconciliationImport({
        businessId: access.businessId,
        importId,
      });

      if (!statementImport) {
        return jsonError("Bank statement import was not found.", 404);
      }

      return Response.json({ import: statementImport });
    }

    const imports = await listBankReconciliationImports({ businessId: access.businessId });
    return Response.json({ imports });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("bank_reconciliation.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load bank reconciliation.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("bankReconciliation", "Bank reconciliation");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, importRequestSchema);
    const limited = await enforceRateLimit(request, "bank_reconciliation.import", 20, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);
    const resolvedLocationId = body.locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId: body.locationId,
          permission: "money:write",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to import bank statements.",
    );

    if (planGate) {
      return planGate;
    }

    const result = await importBankStatementForBusiness({
      businessId: access.businessId,
      userId: user.id,
      csv: body.csv,
      fileName: body.fileName || undefined,
      accountId: body.accountId || undefined,
      locationId: resolvedLocationId,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "bank_reconciliation.imported",
        message: "Bank statement imported for reconciliation.",
        metadata: {
          feature: "phase3f_bank_reconciliation",
          importId: result.importId,
          rowCount: result.rowCount,
          duplicateRowCount: result.duplicateRowCount,
          suggestedMatchCount: result.suggestedMatchCount,
          locationId: resolvedLocationId,
          accountId: body.accountId || undefined,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({
      ...result,
      message: "Bank statement imported for review.",
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("bank_reconciliation.import_failed", error);
    return jsonErrorFromUnknown(error, "Could not import bank statement.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("bankReconciliation", "Bank reconciliation");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, actionRequestSchema);
    const limited = await enforceRateLimit(request, "bank_reconciliation.action", 80, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "growth",
      "Upgrade to Growth to manage bank reconciliation.",
    );

    if (planGate) {
      return planGate;
    }

    const result = await runReconciliationAction({
      businessId: access.businessId,
      userId: user.id,
      importId: body.importId,
      action: body.action,
      matchId: body.matchId,
      notes: body.notes || undefined,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: `bank_reconciliation.${body.action}`,
        message: "Bank reconciliation review action completed.",
        metadata: {
          feature: "phase3f_bank_reconciliation",
          importId: body.importId,
          matchId: body.matchId || undefined,
          action: body.action,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ result, message: "Bank reconciliation updated." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("bank_reconciliation.action_failed", error);
    return jsonErrorFromUnknown(error, "Could not update bank reconciliation.");
  }
}

async function runReconciliationAction({
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
      throw new Error("Choose a match to confirm.");
    }

    return confirmBankReconciliationMatch({ businessId, userId, matchId, notes });
  }

  if (action === "reject_match") {
    if (!matchId) {
      throw new Error("Choose a match to reject.");
    }

    return rejectBankReconciliationMatch({ businessId, userId, matchId, notes });
  }

  if (action === "lock_import") {
    return lockBankStatementImport({ businessId, importId });
  }

  return reopenBankStatementImport({ businessId, importId });
}
