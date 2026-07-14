import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/queue";
import { getWhatsAppClient, normalizeUnknownError } from "@/lib/whatsapp/client";
import { normalizeNigerianPhoneNumber } from "@/lib/whatsapp/formatter";
import {
  debtReminderText,
  invoiceNotificationText,
  lowStockAlertText,
  lowStockAlertTemplate,
  paymentReceivedText,
} from "@/lib/whatsapp/templates";
import type {
  DebtReminderInput,
  InvoiceNotificationInput,
  LowStockAlertInput,
  PaymentReceivedInput,
  SendTemplateMessageInput,
  SendTextMessageInput,
  WhatsAppAuditContext,
  WhatsAppSendResult,
} from "@/lib/whatsapp/types";

export async function sendTextMessage(input: SendTextMessageInput): Promise<WhatsAppSendResult> {
  const normalized = normalizeForSend(input.to);
  if (!normalized.ok) {
    await writeOutboundLog({
      ...input,
      phone: input.to,
      type: "text",
      message: input.message,
      status: "failed",
      metadata: { ...input.metadata, error: normalized.error },
    });
    return fail(normalized.error);
  }

  const preference = await canSend(input.businessId, normalized.phone);
  if (!preference.ok) {
    await writeOutboundLog({
      ...input,
      phone: normalized.phone,
      type: "text",
      message: input.message,
      status: "failed",
      metadata: { ...input.metadata, error: preference.error },
    });
    return fail(preference.error);
  }

  try {
    const response = await getWhatsAppClient().sendText(normalized.phone, input.message);
    const messageId = response.messages?.[0]?.id;
    await writeOutboundLog({
      ...input,
      phone: normalized.phone,
      type: "text",
      message: input.message,
      status: "sent",
      externalId: messageId,
    });

    return { ok: true, phone: normalized.phone, messageId, status: "sent" };
  } catch (error) {
    const normalizedError = normalizeUnknownError(error);
    await writeOutboundLog({
      ...input,
      phone: normalized.phone,
      type: "text",
      message: input.message,
      status: "failed",
      metadata: {
        ...input.metadata,
        error: normalizedError.message,
        retryable: normalizedError.retryable,
      },
    });

    return {
      ok: false,
      phone: normalized.phone,
      status: "failed",
      error: userFacingWhatsAppError(normalizedError),
      retryable: normalizedError.retryable,
    };
  }
}

export async function sendTemplateMessage(
  input: SendTemplateMessageInput,
): Promise<WhatsAppSendResult> {
  const normalized = normalizeForSend(input.to);
  if (!normalized.ok) {
    await writeOutboundLog({
      ...input,
      phone: input.to,
      type: "template",
      message: input.fallbackMessage ?? input.template.name,
      templateName: input.template.name,
      status: "failed",
      metadata: { ...input.metadata, error: normalized.error },
    });
    return fail(normalized.error);
  }

  const preference = await canSend(input.businessId, normalized.phone);
  if (!preference.ok) {
    await writeOutboundLog({
      ...input,
      phone: normalized.phone,
      type: "template",
      message: input.fallbackMessage ?? input.template.name,
      templateName: input.template.name,
      status: "failed",
      metadata: { ...input.metadata, error: preference.error },
    });
    return fail(preference.error);
  }

  try {
    const response = await getWhatsAppClient().sendTemplate(normalized.phone, input.template);
    const messageId = response.messages?.[0]?.id;
    await writeOutboundLog({
      ...input,
      phone: normalized.phone,
      type: "template",
      message: input.fallbackMessage ?? input.template.name,
      templateName: input.template.name,
      status: "sent",
      externalId: messageId,
    });

    return { ok: true, phone: normalized.phone, messageId, status: "sent" };
  } catch (error) {
    const normalizedError = normalizeUnknownError(error);
    await writeOutboundLog({
      ...input,
      phone: normalized.phone,
      type: "template",
      message: input.fallbackMessage ?? input.template.name,
      templateName: input.template.name,
      status: "failed",
      metadata: {
        ...input.metadata,
        error: normalizedError.message,
        retryable: normalizedError.retryable,
      },
    });

    return {
      ok: false,
      phone: normalized.phone,
      status: "failed",
      error: userFacingWhatsAppError(normalizedError),
      retryable: normalizedError.retryable,
    };
  }
}

export function sendDebtReminder(input: DebtReminderInput) {
  return sendTextMessage({
    ...input,
    message: debtReminderText(input),
    metadata: { ...input.metadata, communicationType: "debt_reminder" },
  });
}

export function sendInvoiceNotification(input: InvoiceNotificationInput) {
  return sendTextMessage({
    ...input,
    message: invoiceNotificationText(input),
    metadata: { ...input.metadata, communicationType: "invoice_notification" },
  });
}

export function sendPaymentReceived(input: PaymentReceivedInput) {
  return sendTextMessage({
    ...input,
    message: paymentReceivedText(input),
    metadata: { ...input.metadata, communicationType: "payment_received" },
  });
}

export function sendPaymentReceivedMessage(input: PaymentReceivedInput) {
  return sendPaymentReceived(input);
}

export function sendLowStockAlert(input: LowStockAlertInput) {
  const message = lowStockAlertText(input);
  const template = lowStockAlertTemplate(input);
  const metadata = { ...input.metadata, communicationType: "low_stock_alert" };

  if (template) {
    return sendTemplateMessage({
      ...input,
      template,
      fallbackMessage: message,
      metadata,
    });
  }

  return sendTextMessage({
    ...input,
    message,
    metadata,
  });
}

async function canSend(businessId: string | undefined, phone: string) {
  if (businessId) {
    const preferences = await getPrisma().messagePreference.findUnique({
      where: { businessId },
    });

    if (preferences && !preferences.remindersEnabled) {
      return { ok: false, error: "WhatsApp reminders are disabled for this business." };
    }

    const businessLimit = await enforceRateLimit({
      key: `whatsapp:business:${businessId}`,
      limit: 120,
      windowMs: 60 * 60 * 1000,
    });

    if (!businessLimit.allowed) {
      return { ok: false, error: "WhatsApp hourly limit reached. Try again later." };
    }
  }

  const phoneLimit = await enforceRateLimit({
    key: `whatsapp:phone:${phone}`,
    limit: 3,
    windowMs: 10 * 60 * 1000,
  });

  if (!phoneLimit.allowed) {
    return { ok: false, error: "This phone was contacted recently. Try again later." };
  }

  return { ok: true };
}

function normalizeForSend(phone: string) {
  try {
    return { ok: true as const, phone: normalizeNigerianPhoneNumber(phone) };
  } catch {
    return {
      ok: false as const,
      error: "Enter a valid Nigerian WhatsApp phone number.",
    };
  }
}

function fail(error?: string): WhatsAppSendResult {
  return { ok: false, status: "failed", error: error ?? "Could not send WhatsApp message." };
}

async function writeOutboundLog(input: WhatsAppAuditContext & {
  phone: string;
  type: "text" | "template";
  message: string;
  status: string;
  templateName?: string;
  externalId?: string;
}) {
  try {
    await getPrisma().$transaction(async (tx) => {
      await tx.whatsAppMessage.create({
        data: {
          type: input.type,
          direction: "outbound",
          status: input.status,
          phone: input.phone,
          message: input.message.slice(0, 4000),
          templateName: input.templateName,
          externalId: input.externalId,
          businessId: input.businessId,
          actorId: input.actorId,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      if (input.businessId) {
        const auditMessage = getAuditMessage(input);
        await tx.auditLog.create({
          data: {
            businessId: input.businessId,
            actorId: input.actorId,
            action: `whatsapp.${input.status}`,
            message: auditMessage,
            metadata: {
              phone: input.phone,
              externalId: input.externalId,
              source: input.source,
              templateName: input.templateName,
            },
          },
        });
      }
    });
  } catch (error) {
    console.error("whatsapp.audit_log_failed", error);
  }
}

function userFacingWhatsAppError(error: { message: string; status?: number }) {
  if (error.message.includes("environment") || error.message.includes("configured")) {
    return "WhatsApp is not configured yet. Add the WhatsApp API settings and try again.";
  }

  if (error.status === 429) {
    return "WhatsApp is busy for this number. Try again shortly.";
  }

  if (error.status && error.status >= 500) {
    return "WhatsApp could not send right now. Try again shortly.";
  }

  return "Could not send this WhatsApp message. Check the phone number and try again.";
}

function getAuditMessage(input: {
  status: string;
  type: "text" | "template";
  metadata?: Record<string, unknown>;
}) {
  const status = input.status === "sent" ? "sent" : input.status;
  const communicationType = input.metadata?.communicationType;

  if (communicationType === "debt_reminder") {
    return `WhatsApp debt reminder ${status}`;
  }

  if (communicationType === "invoice_notification") {
    return `Invoice ${status} via WhatsApp`;
  }

  if (communicationType === "payment_received") {
    return `Payment confirmation ${status}`;
  }

  if (communicationType === "low_stock_alert") {
    return `Low stock WhatsApp alert ${status}.`;
  }

  return `WhatsApp ${input.type} message ${status}.`;
}
