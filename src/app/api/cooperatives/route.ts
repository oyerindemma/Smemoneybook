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
  addCooperativeMember,
  createCooperativeGroup,
  listCooperativeDashboard,
  recordCooperativeContribution,
  recordCooperativeLoanRepayment,
  requestCooperativeLoan,
} from "@/lib/phase3/cooperative-service";

export const runtime = "nodejs";

const businessId = z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business."));
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
  z.string().optional(),
).optional();
const positiveMoney = z.coerce.number().positive();

const cooperativeActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_group"),
    businessId,
    locationId: optionalText,
    name: z.string().trim().min(2, "Enter the cooperative name."),
    description: optionalText,
    contributionAmount: z.coerce.number().nonnegative().optional(),
    contributionFrequency: optionalText,
  }),
  z.object({
    action: z.literal("add_member"),
    businessId,
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
    displayName: z.string().trim().min(2, "Enter the member name."),
    phone: optionalText,
    email: optionalText,
    externalReference: optionalText,
  }),
  z.object({
    action: z.literal("record_contribution"),
    businessId,
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
    memberId: z.string().trim().min(1, "Choose a member."),
    planId: optionalText,
    amount: positiveMoney,
    penaltyAmount: z.coerce.number().nonnegative().optional(),
    dueDate: z.coerce.date().optional(),
    paidAt: z.coerce.date().optional(),
    reference: optionalText,
  }),
  z.object({
    action: z.literal("request_loan"),
    businessId,
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
    memberId: z.string().trim().min(1, "Choose a member."),
    principal: positiveMoney,
    interestAmount: z.coerce.number().nonnegative().optional(),
    penaltyAmount: z.coerce.number().nonnegative().optional(),
    dueAt: z.coerce.date().optional(),
    guarantorMemberIds: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    action: z.literal("record_repayment"),
    businessId,
    groupId: z.string().trim().min(1, "Choose a cooperative group."),
    loanId: z.string().trim().min(1, "Choose a cooperative loan."),
    amount: positiveMoney,
    principalPortion: z.coerce.number().nonnegative().optional(),
    interestPortion: z.coerce.number().nonnegative().optional(),
    penaltyPortion: z.coerce.number().nonnegative().optional(),
    paidAt: z.coerce.date().optional(),
    reference: optionalText,
  }),
]);

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("cooperativeGroups", "Cooperative groups");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "cooperatives.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "money:write", requestedBusinessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use cooperative and savings groups.",
    );

    if (planGate) {
      return planGate;
    }

    const groups = await listCooperativeDashboard({ businessId: access.businessId });

    return Response.json({ groups });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("cooperatives.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load cooperative groups.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("cooperativeGroups", "Cooperative groups");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, cooperativeActionSchema);
    const limited = await enforceRateLimit(request, "cooperatives.write", 40, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use cooperative and savings groups.",
    );

    if (planGate) {
      return planGate;
    }

    if (body.action === "create_group" && body.locationId) {
      await requireLocationAccess({
        userId: user.id,
        businessId: access.businessId,
        locationId: body.locationId,
        permission: "locations:view",
      });
    }

    const result = await runAction({
      businessId: access.businessId,
      actorId: user.id,
      body,
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: `cooperatives.${body.action}`,
        message: "Cooperative group action recorded.",
        metadata: {
          feature: "phase3i_cooperatives",
          action: body.action,
          resultId: result.id,
          groupId: "groupId" in body ? body.groupId : result.id,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ result, message: "Cooperative action recorded." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("cooperatives.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not record cooperative action.");
  }
}

async function runAction({
  businessId,
  actorId,
  body,
}: {
  businessId: string;
  actorId: string;
  body: z.infer<typeof cooperativeActionSchema>;
}) {
  if (body.action === "create_group") {
    return createCooperativeGroup({
      businessId,
      actorId,
      locationId: body.locationId || undefined,
      name: body.name,
      description: body.description || undefined,
      contributionAmount: body.contributionAmount,
      contributionFrequency: body.contributionFrequency || undefined,
    });
  }

  if (body.action === "add_member") {
    return addCooperativeMember({
      businessId,
      groupId: body.groupId,
      displayName: body.displayName,
      phone: body.phone || undefined,
      email: body.email || undefined,
      externalReference: body.externalReference || undefined,
    });
  }

  if (body.action === "record_contribution") {
    return recordCooperativeContribution({
      businessId,
      actorId,
      groupId: body.groupId,
      memberId: body.memberId,
      planId: body.planId || undefined,
      amount: body.amount,
      penaltyAmount: body.penaltyAmount,
      dueDate: body.dueDate,
      paidAt: body.paidAt,
      reference: body.reference || undefined,
    });
  }

  if (body.action === "request_loan") {
    return requestCooperativeLoan({
      businessId,
      actorId,
      groupId: body.groupId,
      memberId: body.memberId,
      principal: body.principal,
      interestAmount: body.interestAmount,
      penaltyAmount: body.penaltyAmount,
      dueAt: body.dueAt,
      guarantorMemberIds: body.guarantorMemberIds,
    });
  }

  return recordCooperativeLoanRepayment({
    businessId,
    actorId,
    groupId: body.groupId,
    loanId: body.loanId,
    amount: body.amount,
    principalPortion: body.principalPortion,
    interestPortion: body.interestPortion,
    penaltyPortion: body.penaltyPortion,
    paidAt: body.paidAt,
    reference: body.reference || undefined,
  });
}
