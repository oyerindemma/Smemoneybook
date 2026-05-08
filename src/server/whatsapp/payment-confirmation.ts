import { DebtEventType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { sendPaymentReceivedMessage } from "@/lib/whatsapp/service";

export async function sendPaymentConfirmationForCollection({
  userId,
  businessId,
  debtId,
}: {
  userId: string;
  businessId: string;
  debtId: string;
}) {
  const debt = await getPrisma().debt.findFirst({
    where: { id: debtId, businessId },
    include: {
      business: { select: { name: true } },
      customer: true,
      events: {
        where: { type: DebtEventType.CUSTOMER_COLLECTION },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!debt?.customer?.phone) {
    return {
      ok: false,
      message: "Payment was saved, but this customer has no WhatsApp phone number.",
    };
  }

  const amount = debt.events[0]?.amount?.toNumber() ?? debt.paidAmount.toNumber();
  if (amount <= 0) {
    return { ok: false, message: "Payment was saved, but no collection amount was found." };
  }

  return sendPaymentReceivedMessage({
    to: debt.customer.phone,
    customerName: debt.customer.name,
    businessName: debt.business.name,
    amount,
    businessId,
    actorId: userId,
    source: "debt.collection.after",
    metadata: { debtId, communicationType: "payment_received" },
  });
}
