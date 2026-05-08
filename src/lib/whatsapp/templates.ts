import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

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
  amount,
  invoiceNumber,
  dueDate,
}: {
  customerName: string;
  businessName: string;
  amount: number | string;
  invoiceNumber?: string;
  dueDate?: string | Date | null;
}) {
  const invoice = invoiceNumber ?? "your invoice";
  const due = dueDate ? `\nDue date: ${formatDate(dueDate)}.` : "";
  return `Hello ${customerName},\nInvoice ${invoice} has been issued.\nTotal: ${formatAmount(amount)}.${due}\nThank you for your business.`;
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
