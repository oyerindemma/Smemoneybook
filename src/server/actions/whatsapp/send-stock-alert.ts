"use server";

import { requireUser } from "@/lib/auth/session";
import { hasMinimumPlan } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { normalizeNigerianPhoneNumber } from "@/lib/whatsapp/formatter";
import { sendLowStockAlert } from "@/lib/whatsapp/service";
import { lowStockAlertText } from "@/lib/whatsapp/templates";

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

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeNigerianPhoneNumber(input.ownerPhone);
    } catch {
      return { ok: false, message: "Enter a valid Nigerian WhatsApp phone number." };
    }

    const fallbackMessage = lowStockAlertText({
      businessName: business.businessName,
      productName: item.name,
      quantityOnHand: item.quantityOnHand,
      lowStockLevel: item.lowStockLevel,
    });
    const fallbackUrl = `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(fallbackMessage)}`;
    const result = await sendLowStockAlert({
      to: normalizedPhone,
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
      return {
        ok: false,
        message: `${result.error ?? "Could not send stock alert."} Opening WhatsApp so you can send it manually.`,
        whatsappUrl: fallbackUrl,
      };
    }

    return { ok: true, message: "Stock alert sent." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send stock alert.",
    };
  }
}
