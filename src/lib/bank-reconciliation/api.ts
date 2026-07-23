import { Prisma } from "@prisma/client";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getPrisma } from "@/lib/prisma";
import {
  BankReconciliationAccessError,
  type BankReconciliationAccess,
} from "@/lib/bank-reconciliation/authorization";
import type {
  BankReconciliationActionName,
  BankStatementRowStatus,
} from "@/lib/bank-reconciliation/definitions";

export class BankReconciliationDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "bank_reconciliation_invalid") {
    super(message);
    this.name = "BankReconciliationDomainError";
    this.status = status;
    this.code = code;
  }
}

export type BankReconciliationListFilters = {
  businessId: string;
  importId?: string;
  status?: BankStatementRowStatus;
  duplicateStatus?: string;
  query?: string;
  from?: Date;
  to?: Date;
  limit: number;
};

export function parseBankReconciliationListRequest(url: string): BankReconciliationListFilters {
  const searchParams = new URL(url).searchParams;
  const businessId = requiredParam(searchParams.get("businessId"), "Choose a business.");
  const from = parseOptionalDate(searchParams.get("from"), "Choose a valid start date.");
  const to = parseOptionalDate(searchParams.get("to"), "Choose a valid end date.");

  if (from && to && from > to) {
    throw new BankReconciliationDomainError("Start date must be before end date.", 400, "invalid_date_range");
  }

  return {
    businessId,
    importId: optionalParam(searchParams.get("importId")),
    status: parseStatus(searchParams.get("status")),
    duplicateStatus: optionalParam(searchParams.get("duplicateStatus")),
    query: optionalParam(searchParams.get("query")),
    from,
    to,
    limit: Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 100),
  };
}

export function parseBankReconciliationImportRequest(url: string) {
  const searchParams = new URL(url).searchParams;
  return {
    businessId: requiredParam(searchParams.get("businessId"), "Choose a business."),
    importId: optionalParam(searchParams.get("importId")),
  };
}

export function bankReconciliationErrorResponse(error: unknown, fallback: string) {
  if (error instanceof BankReconciliationAccessError || error instanceof BankReconciliationDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError("Sign in to continue.", error.status);
  }

  console.error(error);
  return jsonErrorFromUnknown(error, fallback);
}

export async function logBankReconciliationEvent({
  access,
  action,
  message,
  entryId,
  matchId,
  importId,
  metadata,
}: {
  access: BankReconciliationAccess;
  action: `bank_reconciliation.${BankReconciliationActionName}`;
  message: string;
  entryId?: string;
  matchId?: string;
  importId?: string;
  metadata?: Prisma.InputJsonObject;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message,
      metadata: {
        feature: "phase3_bank_reconciliation",
        importId: importId ?? null,
        entryId: entryId ?? null,
        matchId: matchId ?? null,
        locationId: access.locationId ?? null,
        ...(metadata ?? {}),
      } as Prisma.InputJsonObject,
    },
  });
}

function parseStatus(value: string | null): BankStatementRowStatus | undefined {
  const normalized = optionalParam(value)?.toUpperCase();

  if (!normalized) {
    return undefined;
  }

  if (["UNMATCHED", "SUGGESTED", "MATCHED", "DUPLICATE", "IGNORED"].includes(normalized)) {
    return normalized as BankStatementRowStatus;
  }

  throw new BankReconciliationDomainError("Choose a valid reconciliation status.", 400, "invalid_status");
}

function parseOptionalDate(value: string | null, message: string) {
  const trimmed = optionalParam(value);

  if (!trimmed) {
    return undefined;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    throw new BankReconciliationDomainError(message, 400, "invalid_date");
  }

  return parsed;
}

function requiredParam(value: string | null, message: string) {
  const trimmed = optionalParam(value);

  if (!trimmed) {
    throw new BankReconciliationDomainError(message, 400, "missing_param");
  }

  return trimmed;
}

function optionalParam(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
