export type WhatsAppMessageType = "text" | "template";
export type WhatsAppDirection = "outbound" | "inbound";
export type WhatsAppStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "received";

export type WhatsAppAuditContext = {
  businessId?: string;
  actorId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type WhatsAppSendResult = {
  ok: boolean;
  phone?: string;
  messageId?: string;
  status: WhatsAppStatus;
  error?: string;
  retryable?: boolean;
};

export type WhatsAppTemplateComponent = {
  type: "body" | "header" | "button";
  parameters?: Array<
    | { type: "text"; text: string }
    | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
    | { type: "date_time"; date_time: { fallback_value: string } }
  >;
  sub_type?: "url" | "quick_reply";
  index?: string;
};

export type WhatsAppTemplateRequest = {
  name: string;
  languageCode?: string;
  components?: WhatsAppTemplateComponent[];
};

export type SendTextMessageInput = WhatsAppAuditContext & {
  to: string;
  message: string;
};

export type SendTemplateMessageInput = WhatsAppAuditContext & {
  to: string;
  template: WhatsAppTemplateRequest;
  fallbackMessage?: string;
};

export type DebtReminderInput = WhatsAppAuditContext & {
  to: string;
  customerName: string;
  businessName: string;
  amount: number | string;
  dueDate?: string | Date | null;
};

export type InvoiceNotificationInput = DebtReminderInput & {
  invoiceNumber?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
};

export type PaymentReceivedInput = WhatsAppAuditContext & {
  to: string;
  customerName: string;
  businessName: string;
  amount: number | string;
};

export type LowStockAlertInput = WhatsAppAuditContext & {
  to: string;
  businessName: string;
  productName: string;
  quantityOnHand: number;
  lowStockLevel: number;
};

export type IncomingWhatsAppMessage = {
  from: string;
  id?: string;
  timestamp?: string;
  text?: string;
  type?: string;
};

export type WhatsAppWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipientId?: string;
};
