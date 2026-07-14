"use server";

import { DebtStatus, DebtType } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { sendInvoiceNotification } from "@/lib/whatsapp/service";

export async function sendInvoiceAction(input: { businessId: string; debtId: string }) {
  try {
    const user = await requireUser();
    const business = await requireBusinessAccess(user.id, "money:write", input.businessId);
    const debt = await getPrisma().debt.findFirst({
      where: {
        id: input.debtId,
        businessId: business.businessId,
        status: DebtStatus.OPEN,
        type: DebtType.CUSTOMER_OWES_BUSINESS,
      },
      include: {
        customer: true,
        sourceTransaction: true,
      },
    });

    if (!debt?.customer?.phone) {
      throw new Error("Add this customer's phone number first.");
    }

    const amount = debt.amount.minus(debt.paidAmount).toNumber();
    const result = await sendInvoiceNotification({
      to: debt.customer.phone,
      customerName: debt.customer.name,
      businessName: business.businessName,
      amount,
      items: parseInvoiceItems(debt.sourceTransaction.invoiceItems),
      dueDate: debt.dueAt,
      invoiceNumber: debt.sourceTransactionId.slice(0, 8).toUpperCase(),
      businessId: business.businessId,
      actorId: user.id,
      source: "server_action.invoice",
      metadata: { debtId: debt.id, amount: formatNaira(amount) },
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Could not send invoice.");
    }

    return { ok: true, message: "Invoice sent on WhatsApp." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send invoice.",
    };
  }
}

function parseInvoiceItems(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const quantity = Number(candidate.quantity);
    const unitPrice = Number(candidate.unitPrice);
    const total = Number(candidate.total);

    if (!name || !Number.isFinite(quantity) || quantity <= 0) {
      return [];
    }

    return [
      {
        name,
        quantity,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        total: Number.isFinite(total) ? total : 0,
      },
    ];
  });

  return items.length > 0 ? items : undefined;
}
