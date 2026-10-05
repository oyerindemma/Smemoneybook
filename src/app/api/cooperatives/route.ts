import { z } from "zod";
import { assertSameOriginRequest } from "@/lib/api/http";
import { parseJsonBody } from "@/lib/api/validation";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import {
  cooperativesCapabilityPayload,
  cooperativesErrorResponse,
  cooperativesMethodNotAllowed,
  logCooperativesAudit,
  parseCooperativesBusinessRequest,
} from "@/lib/cooperatives/api";
import { requireCooperativesAccess, type CooperativesPermission } from "@/lib/cooperatives/authorization";
import {
  addCooperativeMember,
  createContributionPlan,
  createCooperativeGroup,
  listCooperativeDashboard,
  recordCooperativeContribution,
} from "@/lib/cooperatives/contributions";
import { requestCooperativeLoan } from "@/lib/cooperatives/loans";
import { recordCooperativeLoanRepayment } from "@/lib/cooperatives/repayments";
import { requireLocationAccess } from "@/lib/operations/access";
import {
  contributionPlanCreateSchema,
  contributionRecordSchema,
  groupCreateSchema,
  memberCreateSchema,
  positiveMoney,
  optionalText,
} from "@/lib/cooperatives/validation";

export const runtime = "nodejs";

const legacyActionSchema = z.discriminatedUnion("action", [
  groupCreateSchema.extend({ action: z.literal("create_group") }),
  memberCreateSchema.extend({
    action: z.literal("add_member"),
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
  }),
  contributionPlanCreateSchema.extend({
    action: z.literal("create_plan"),
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
  }),
  contributionRecordSchema.extend({
    action: z.literal("record_contribution"),
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
  }),
  z.object({
    action: z.literal("request_loan"),
    businessId: z.string().trim().min(1, "Choose a business."),
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
    memberId: z.string().trim().min(1, "Choose a member."),
    principal: positiveMoney,
    interestAmount: z.coerce.number().nonnegative().optional(),
    interestRate: z.coerce.number().nonnegative().optional(),
    interestMethod: z.enum(["zero", "flat", "reducing_balance"]).optional(),
    penaltyAmount: z.coerce.number().nonnegative().optional(),
    termCount: z.coerce.number().int().positive().optional(),
    repaymentFrequency: optionalText,
    purpose: optionalText,
    dueAt: z.coerce.date().optional(),
    guarantorMemberIds: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    action: z.literal("record_repayment"),
    businessId: z.string().trim().min(1, "Choose a business."),
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
    loanId: z.string().trim().min(1, "Choose a cooperative loan."),
    scheduleId: optionalText,
    amount: positiveMoney,
    principalPortion: z.coerce.number().nonnegative().optional(),
    interestPortion: z.coerce.number().nonnegative().optional(),
    penaltyPortion: z.coerce.number().nonnegative().optional(),
    paidAt: z.coerce.date().optional(),
    reference: optionalText,
    paymentReference: optionalText,
    idempotencyKey: optionalText,
  }),
]);

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const limited = await enforceRateLimit(request, "cooperatives.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const filters = parseCooperativesBusinessRequest(request.url);
    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: filters.businessId,
      permission: "cooperatives:read",
    });
    const groups = await listCooperativeDashboard({
      businessId: access.businessId,
      includeSensitive: access.canViewMemberSensitive,
    });

    return Response.json({
      groups,
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not load cooperatives.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, legacyActionSchema);
    const limited = await enforceRateLimit(request, "cooperatives.write", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireCooperativesAccess({
      userId: user.id,
      businessId: body.businessId,
      permission: permissionForLegacyAction(body.action),
    });

    if (body.action === "create_group" && body.locationId) {
      await requireLocationAccess({
        userId: user.id,
        businessId: access.businessId,
        locationId: body.locationId,
        permission: "locations:view",
      });
    }

    const result = await runLegacyAction({
      businessId: access.businessId,
      actorId: user.id,
      body,
    });

    await logCooperativesAudit({
      access,
      action: auditActionForLegacyAction(body.action),
      metadata: {
        action: body.action,
        resultId: result.id,
        groupId: "groupId" in body ? body.groupId : result.id,
      },
    });

    return Response.json({
      result,
      message: "Cooperative action recorded.",
      capabilities: cooperativesCapabilityPayload(access),
    });
  } catch (error) {
    return cooperativesErrorResponse(error, "Could not record cooperative action.");
  }
}

export function PUT() {
  return cooperativesMethodNotAllowed("GET, POST");
}

export function PATCH() {
  return cooperativesMethodNotAllowed("GET, POST");
}

export function DELETE() {
  return cooperativesMethodNotAllowed("GET, POST");
}

async function runLegacyAction({
  businessId,
  actorId,
  body,
}: {
  businessId: string;
  actorId: string;
  body: z.infer<typeof legacyActionSchema>;
}) {
  if (body.action === "create_group") {
    return createCooperativeGroup({
      ...body,
      businessId,
      actorId,
    });
  }

  if (body.action === "add_member") {
    return addCooperativeMember({
      ...body,
      businessId,
    });
  }

  if (body.action === "create_plan") {
    return createContributionPlan({
      ...body,
      businessId,
    });
  }

  if (body.action === "record_contribution") {
    return recordCooperativeContribution({
      ...body,
      businessId,
      actorId,
    });
  }

  if (body.action === "request_loan") {
    const interestMethod = body.interestMethod ?? (body.interestAmount ? "flat" : "zero");
    const interestRate =
      body.interestRate ?? (body.interestAmount && body.principal > 0 ? (body.interestAmount / body.principal) * 100 : 0);

    return requestCooperativeLoan({
      businessId,
      actorId,
      groupId: body.groupId,
      memberId: body.memberId,
      principal: body.principal,
      interestRate,
      interestMethod,
      penaltyAmount: body.penaltyAmount,
      termCount: body.termCount,
      repaymentFrequency: body.repaymentFrequency,
      purpose: body.purpose,
      dueAt: body.dueAt,
      guarantorMemberIds: body.guarantorMemberIds,
    });
  }

  return recordCooperativeLoanRepayment({
    ...body,
    businessId,
    actorId,
  });
}

function permissionForLegacyAction(action: z.infer<typeof legacyActionSchema>["action"]): CooperativesPermission {
  if (action === "create_group") {
    return "cooperatives:manage";
  }

  if (action === "add_member") {
    return "cooperatives:manage_members";
  }

  if (action === "record_contribution" || action === "create_plan") {
    return "cooperatives:record_contributions";
  }

  if (action === "record_repayment") {
    return "cooperatives:record_repayment";
  }

  return "cooperatives:review_loans";
}

function auditActionForLegacyAction(action: z.infer<typeof legacyActionSchema>["action"]) {
  if (action === "create_group") {
    return "cooperatives.group_created" as const;
  }

  if (action === "add_member") {
    return "cooperatives.member_created" as const;
  }

  if (action === "create_plan") {
    return "cooperatives.plan_created" as const;
  }

  if (action === "record_contribution") {
    return "cooperatives.contribution_recorded" as const;
  }

  if (action === "record_repayment") {
    return "cooperatives.loan_repayment_recorded" as const;
  }

  return "cooperatives.loan_requested" as const;
}
