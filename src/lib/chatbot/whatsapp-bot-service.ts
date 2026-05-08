import { getPrisma } from "@/lib/prisma";
import { normalizeNigerianPhoneNumber } from "@/lib/whatsapp/formatter";
import { sendTextMessage } from "@/lib/whatsapp/service";
import { routeWhatsAppBotMessage } from "@/lib/chatbot/whatsapp-bot-router";

export async function handleIncomingWhatsAppBotMessage({
  from,
  text,
  externalId,
}: {
  from: string;
  text: string;
  externalId?: string;
}) {
  const phone = normalizeNigerianPhoneNumber(from);
  const identity = await findBusinessByPhone(phone);

  if (!identity) {
    return { ok: false, message: "No matching business found for WhatsApp sender." };
  }

  const reply = await routeWhatsAppBotMessage({
    businessId: identity.businessId,
    message: text,
  });

  const result = await sendTextMessage({
    to: phone,
    message: reply,
    businessId: identity.businessId,
    source: "whatsapp_bot",
    metadata: { externalId, inboundPhone: phone },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: identity.businessId,
      action: "whatsapp.bot.reply",
      message: "WhatsApp chatbot replied.",
      metadata: { externalId, phone, resultOk: result.ok },
    },
  });

  return result;
}

async function findBusinessByPhone(phone: string) {
  const [customers, suppliers] = await Promise.all([
    getPrisma().customer.findMany({
      where: { phone: { not: null } },
      select: { phone: true, businessId: true },
      take: 500,
    }),
    getPrisma().supplier.findMany({
      where: { phone: { not: null } },
      select: { phone: true, businessId: true },
      take: 500,
    }),
  ]);

  for (const contact of [...customers, ...suppliers]) {
    if (contact.phone && normalizeNigerianPhoneNumber(contact.phone) === phone) {
      return { businessId: contact.businessId };
    }
  }

  return null;
}
