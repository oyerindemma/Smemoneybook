import { formatNaira } from "@/lib/bookkeeping/transaction-engine";
import type { WhatsAppTemplateRequest } from "@/lib/whatsapp/types";

function formatAmount(amount: number | string) {
  return typeof amount === "number" ? formatNaira(amount) : amount;
}

function formatDate(value?: string | Date | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function debtReminderText({
  customerName,
  businessName,
  amount,
  dueDate,
}: {
  customerName: string;
  businessName: string;
  amount: number | string;
  dueDate?: string | Date | null;
}) {
  const due = dueDate ? `\nDue date: ${formatDate(dueDate)}.` : "";
  return `Hello ${customerName},\nYou still owe ${formatAmount(amount)} to ${businessName}.${due}\nKindly make payment today.\nThank you.`;
}

export function invoiceNotificationText({
  customerName,
  businessName,
  amount,
  invoiceNumber,
  items,
  dueDate,
}: {
  customerName: string;
  businessName: string;
  amount: number | string;
  invoiceNumber?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  dueDate?: string | Date | null;
}) {
  const invoice = invoiceNumber ?? "your invoice";
  const due = dueDate ? `\nDue date: ${formatDate(dueDate)}.` : "";
  const itemLines = items?.length
    ? `\nItems:\n${items
        .map(
          (item, index) =>
            `${index + 1}. ${item.name} x ${item.quantity} @ ${formatAmount(item.unitPrice)} = ${formatAmount(item.total)}`,
        )
        .join("\n")}`
    : "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://smemoneybook.com";
  return `Hello ${customerName},\nInvoice ${invoice} has been issued by ${businessName}.${itemLines}\nTotal: ${formatAmount(amount)}.${due}\nThank you for your business.\n\nPowered by SME MoneyBook\n${appUrl}`;
}

export function paymentReceivedText({
  amount,
}: {
  customerName: string;
  businessName: string;
  amount: number | string;
}) {
  return `Payment received successfully.\n${formatAmount(amount)} has been recorded.\nThank you.`;
}

export function lowStockAlertText({
  businessName,
  productName,
  quantityOnHand,
  lowStockLevel,
}: {
  businessName: string;
  productName: string;
  quantityOnHand: number;
  lowStockLevel: number;
}) {
  return `${businessName} stock alert: ${productName} has ${quantityOnHand} left. Your low stock alert level is ${lowStockLevel}.`;
}

export function lowStockAlertTemplate(input: {
  businessName: string;
  productName: string;
  quantityOnHand: number;
  lowStockLevel: number;
}): WhatsAppTemplateRequest | null {
  const templateName = process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME?.trim();

  if (!templateName) {
    return null;
  }

  return {
    name: templateName,
    languageCode: process.env.WHATSAPP_LOW_STOCK_TEMPLATE_LANGUAGE?.trim() || "en",
    components: [
      {
        type: "body",
        parameters: [
          { type: "text", text: input.businessName },
          { type: "text", text: input.productName },
          { type: "text", text: String(input.quantityOnHand) },
          { type: "text", text: String(input.lowStockLevel) },
        ],
      },
    ],
  };
}
