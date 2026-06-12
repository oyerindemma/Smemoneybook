"use server";

import { requireUser } from "@/lib/auth/session";
import { hasMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { sendLowStockAlert } from "@/lib/whatsapp/service";

export async function sendStockAlertAction(input: {
  businessId: string;
  itemId: string;
  ownerPhone: string;
}) {
  try {
    const user = await requireUser();
    const business = await requireBusinessAccess(user.id, "inventory:write", input.businessId);

    if (!(await hasMinimumPlan(user.id, business.businessId, "growth"))) {
      return { ok: false, message: "Upgrade to Growth to send stock alerts." };
    }

    const item = await getPrisma().inventoryItem.findFirst({
      where: { id: input.itemId, businessId: business.businessId },
    });

    if (!item) {
      throw new Error("Choose a valid product.");
    }

    const result = await sendLowStockAlert({
      to: input.ownerPhone,
      businessName: business.businessName,
      productName: item.name,
      quantityOnHand: item.quantityOnHand,
      lowStockLevel: item.lowStockLevel,
      businessId: business.businessId,
      actorId: user.id,
      source: "server_action.stock_alert",
      metadata: { itemId: item.id },
    });

    if (!result.ok) {
      throw new Error(result.error ?? "Could not send stock alert.");
    }

    return { ok: true, message: "Stock alert sent." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send stock alert.",
    };
  }
}
