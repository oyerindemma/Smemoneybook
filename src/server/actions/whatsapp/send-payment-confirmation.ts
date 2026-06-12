"use server";

import { DebtStatus, DebtType } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { hasMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { sendPaymentReceived } from "@/lib/whatsapp/service";

export async function sendPaymentConfirmationAction(input: {
  businessId: string;
  debtId: string;
  amount?: number;
}) {
  try {
    const user = await requireUser();
    const business = await requireBusinessAccess(user.id, "money:write", input.businessId);

    if (!(await hasMinimumPlan(user.id, business.businessId, "growth"))) {
      return { ok: false, message: "Upgrade to Growth to send payment confirmations." };
    }

    const debt = await getPrisma().debt.findFirst({
      where: {
        id: input.debtId,
        businessId: business.businessId,
        type: DebtType.CUSTOMER_OWES_BUSINESS,
      },
      include: { customer: true },
    });

    if (!debt?.customer?.phone) {
      throw new Error("Add this customer's phone number first.");
    }

    const amount = input.amount ?? (debt.paidAmount.toNumber() || debt.amount.toNumber());
    const result = await sendPaymentReceived({
      to: debt.customer.phone,
      customerName: debt.customer.name,
      businessName: business.businessName,
      amount,
      businessId: business.businessId,
      actorId: user.id,
      source: "server_action.payment_confirmation",
      metadata: { debtId: debt.id, status: debt.status === DebtStatus.SETTLED ? "settled" : "open" },
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Could not send payment confirmation.");
    }

    return { ok: true, message: "Payment confirmation sent." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send payment confirmation.",
    };
  }
}
