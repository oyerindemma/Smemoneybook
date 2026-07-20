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
  approvePayrollRun,
  createPayrollEmployee,
  draftPayrollRun,
  listPayrollDashboard,
  lockPayrollRun,
  reversePayrollRun,
} from "@/lib/phase3/payroll-service";

export const runtime = "nodejs";

const businessId = z.preprocess((val) => val ?? "", z.string().trim().min(1, "Choose a business."));
const optionalText = z.preprocess(
  (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
  z.string().optional(),
).optional();
const moneyLineSchema = z.object({
  label: z.string().trim().min(1),
  amount: z.coerce.number().nonnegative(),
});

const payrollActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create_employee"),
    businessId,
    locationId: optionalText,
    displayName: z.string().trim().min(2, "Enter employee name."),
    roleTitle: optionalText,
    baseSalary: z.coerce.number().nonnegative(),
    payFrequency: optionalText,
    country: optionalText,
    currency: optionalText,
    employeeCode: optionalText,
    email: optionalText,
    phone: optionalText,
    pensionNumber: optionalText,
    taxId: optionalText,
  }),
  z.object({
    action: z.literal("draft_run"),
    businessId,
    locationId: optionalText,
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    payDate: z.coerce.date(),
    country: optionalText,
    adjustments: z
      .array(
        z.object({
          employeeId: z.string().trim().min(1),
          allowances: z.array(moneyLineSchema).optional(),
          bonuses: z.array(moneyLineSchema).optional(),
          deductions: z.array(moneyLineSchema).optional(),
          loansAndAdvances: z.array(moneyLineSchema).optional(),
          pensionEmployeeAmount: z.coerce.number().nonnegative().optional(),
          pensionEmployerAmount: z.coerce.number().nonnegative().optional(),
          taxAmount: z.coerce.number().nonnegative().optional(),
        }),
      )
      .optional(),
  }),
  z.object({
    action: z.literal("approve_run"),
    businessId,
    runId: z.string().trim().min(1, "Choose a payroll run."),
  }),
  z.object({
    action: z.literal("lock_run"),
    businessId,
    runId: z.string().trim().min(1, "Choose a payroll run."),
  }),
  z.object({
    action: z.literal("reverse_run"),
    businessId,
    runId: z.string().trim().min(1, "Choose a payroll run."),
    reason: z.string().trim().min(10, "Enter the reversal reason."),
  }),
]);

export async function GET(request: Request) {
  try {
    const featureGate = requirePhase3Feature("payroll", "Payroll");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const limited = await enforceRateLimit(request, "payroll.read", 80, 15 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const { searchParams } = new URL(request.url);
    const requestedBusinessId = searchParams.get("businessId") ?? undefined;
    const locationId = searchParams.get("locationId") ?? undefined;
    const access = await requireBusinessAccess(user.id, "admin", requestedBusinessId);
    const resolvedLocationId = locationId
      ? (await requireLocationAccess({
          userId: user.id,
          businessId: access.businessId,
          locationId,
          permission: "admin",
        })).locationId
      : undefined;
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use Payroll.",
    );

    if (planGate) {
      return planGate;
    }

    const dashboard = await listPayrollDashboard({
      businessId: access.businessId,
      locationId: resolvedLocationId,
    });

    return Response.json({ dashboard });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("payroll.read_failed", error);
    return jsonErrorFromUnknown(error, "Could not load payroll.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const featureGate = requirePhase3Feature("payroll", "Payroll");

    if (featureGate) {
      return featureGate;
    }

    const user = await requireUser();
    const body = await parseJsonBody(request, payrollActionSchema);
    const limited = await enforceRateLimit(request, "payroll.write", 30, 60 * 60 * 1000);

    if (limited) {
      return limited;
    }

    const access = await requireBusinessAccess(user.id, "admin", body.businessId);
    const planGate = await requireMinimumPlan(
      user.id,
      access.businessId,
      "pro",
      "Upgrade to Pro to use Payroll.",
    );

    if (planGate) {
      return planGate;
    }

    if ("locationId" in body && body.locationId) {
      await requireLocationAccess({
        userId: user.id,
        businessId: access.businessId,
        locationId: body.locationId,
        permission: "admin",
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
        action: `payroll.${body.action}`,
        message: "Payroll action recorded.",
        metadata: {
          feature: "phase3j_payroll",
          action: body.action,
          resultId: result.id,
        } as Prisma.InputJsonObject,
      },
    });

    return Response.json({ result, message: "Payroll action recorded." });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error("payroll.write_failed", error);
    return jsonErrorFromUnknown(error, "Could not record payroll action.");
  }
}

async function runAction({
  businessId,
  actorId,
  body,
}: {
  businessId: string;
  actorId: string;
  body: z.infer<typeof payrollActionSchema>;
}) {
  if (body.action === "create_employee") {
    return createPayrollEmployee({
      businessId,
      locationId: body.locationId || undefined,
      displayName: body.displayName,
      roleTitle: body.roleTitle || undefined,
      baseSalary: body.baseSalary,
      payFrequency: body.payFrequency || undefined,
      country: body.country || undefined,
      currency: body.currency || undefined,
      employeeCode: body.employeeCode || undefined,
      email: body.email || undefined,
      phone: body.phone || undefined,
      pensionNumber: body.pensionNumber || undefined,
      taxId: body.taxId || undefined,
    });
  }

  if (body.action === "draft_run") {
    return draftPayrollRun({
      businessId,
      actorId,
      locationId: body.locationId || undefined,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      payDate: body.payDate,
      country: body.country || undefined,
      adjustments: body.adjustments,
    });
  }

  if (body.action === "approve_run") {
    return approvePayrollRun({ businessId, runId: body.runId, actorId });
  }

  if (body.action === "lock_run") {
    return lockPayrollRun({ businessId, runId: body.runId, actorId });
  }

  return reversePayrollRun({
    businessId,
    runId: body.runId,
    reason: body.reason,
  });
}
