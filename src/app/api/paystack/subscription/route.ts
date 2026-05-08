import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { getBillingPlanByDbPlan } from "@/lib/billing/plans";
import { getBillingOverview } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const businessId = new URL(request.url).searchParams.get("businessId")?.trim();

    if (!businessId) {
      return jsonError("Business is required.");
    }

    const access = await requireBusinessAccess(user.id, "admin", businessId);
    const overview = await getBillingOverview(user.id, access.businessId);

    return Response.json({
      currentPlan: overview.active
        ? {
            id: getBillingPlanByDbPlan(overview.active.plan)?.id ?? overview.active.plan.toLowerCase(),
            name: getBillingPlanByDbPlan(overview.active.plan)?.name ?? overview.active.plan,
            status: overview.active.status,
            paidAt: overview.active.paidAt,
            currentPeriodEnd: overview.active.currentPeriodEnd,
          }
        : null,
      history: overview.history.map((subscription) => ({
        id: subscription.id,
        reference: subscription.reference,
        plan: getBillingPlanByDbPlan(subscription.plan)?.name ?? subscription.plan,
        status: subscription.status,
        amount: subscription.amount ?? subscription.amountMonthlyKobo / 100,
        paidAt: subscription.paidAt,
        createdAt: subscription.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not load billing details.");
  }
}
