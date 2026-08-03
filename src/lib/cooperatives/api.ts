import { Prisma } from "@prisma/client";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { CooperativesAccessError, type CooperativesAccess } from "@/lib/cooperatives/authorization";
import { getPrisma } from "@/lib/prisma";

export class CooperativesDomainError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = "cooperatives_invalid") {
    super(message);
    this.name = "CooperativesDomainError";
    this.status = status;
    this.code = code;
  }
}

export function parseCooperativesBusinessRequest(url: string) {
  const searchParams = new URL(url).searchParams;

  return {
    businessId: searchParams.get("businessId")?.trim() ?? "",
    locationId: searchParams.get("locationId")?.trim() || undefined,
    memberId: searchParams.get("memberId")?.trim() || undefined,
    from: searchParams.get("from")?.trim() || undefined,
    to: searchParams.get("to")?.trim() || undefined,
  };
}

export function cooperativesMethodNotAllowed(allow = "GET") {
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: { Allow: allow },
    },
  );
}

export function cooperativesErrorResponse(error: unknown, fallback: string) {
  if (error instanceof CooperativesAccessError || error instanceof CooperativesDomainError) {
    return jsonError(error.message, error.status);
  }

  if (error instanceof Response) {
    return jsonError(error.statusText || "Sign in to continue.", error.status);
  }

  console.error("cooperatives.request_failed", error);
  return jsonErrorFromUnknown(error, fallback);
}

export function cooperativesCapabilityPayload(access: CooperativesAccess) {
  return {
    canRead: access.canRead,
    canManage: access.canManage,
    canManageMembers: access.canManageMembers,
    canRecordContributions: access.canRecordContributions,
    canReviewLoans: access.canReviewLoans,
    canApproveLoans: access.canApproveLoans,
    canRecordDisbursement: access.canRecordDisbursement,
    canRecordRepayment: access.canRecordRepayment,
    canExport: access.canExport,
    canViewMemberSensitive: access.canViewMemberSensitive,
  };
}

export async function logCooperativesAudit({
  access,
  action,
  metadata = {},
}: {
  access: CooperativesAccess;
  action:
    | "cooperatives.group_created"
    | "cooperatives.group_updated"
    | "cooperatives.member_created"
    | "cooperatives.plan_created"
    | "cooperatives.contribution_recorded"
    | "cooperatives.contribution_reversed"
    | "cooperatives.loan_requested"
    | "cooperatives.loan_submitted"
    | "cooperatives.loan_approved"
    | "cooperatives.loan_rejected"
    | "cooperatives.loan_disbursement_recorded"
    | "cooperatives.loan_repayment_recorded"
    | "cooperatives.export_generated"
    | "cooperatives.transfer_recorded";
  metadata?: Record<string, unknown>;
}) {
  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: access.userId,
      action,
      message: cooperativesAuditMessage(action),
      metadata: {
        feature: "phase3j_cooperatives",
        role: access.role,
        ...metadata,
      } as Prisma.InputJsonObject,
    },
  }).catch(() => undefined);
}

function cooperativesAuditMessage(action: string) {
  if (action === "cooperatives.group_created") {
    return "Cooperative profile created.";
  }

  if (action === "cooperatives.group_updated") {
    return "Cooperative profile updated.";
  }

  if (action === "cooperatives.member_created") {
    return "Cooperative member created.";
  }

  if (action === "cooperatives.plan_created") {
    return "Cooperative contribution plan created.";
  }

  if (action === "cooperatives.contribution_recorded") {
    return "Cooperative contribution recorded.";
  }

  if (action === "cooperatives.contribution_reversed") {
    return "Cooperative contribution reversed.";
  }

  if (action === "cooperatives.loan_requested") {
    return "Cooperative loan requested.";
  }

  if (action === "cooperatives.loan_submitted") {
    return "Cooperative loan submitted for review.";
  }

  if (action === "cooperatives.loan_approved") {
    return "Cooperative loan approved.";
  }

  if (action === "cooperatives.loan_rejected") {
    return "Cooperative loan rejected.";
  }

  if (action === "cooperatives.loan_disbursement_recorded") {
    return "Cooperative loan disbursement recorded.";
  }

  if (action === "cooperatives.loan_repayment_recorded") {
    return "Cooperative loan repayment recorded.";
  }

  if (action === "cooperatives.transfer_recorded") {
    return "Cooperative ledger transfer recorded.";
  }

  return "Cooperative export generated.";
}
