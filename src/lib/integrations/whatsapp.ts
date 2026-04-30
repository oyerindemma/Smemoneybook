export function buildWhatsAppReminder({
  phone,
  partyName,
  amount,
  businessName,
}: {
  phone?: string;
  partyName: string;
  amount: string;
  businessName: string;
}) {
  const message = `Hello ${partyName}, this is a reminder from ${businessName}. Your outstanding balance is ${amount}. Thank you.`;
  const digits = phone?.replace(/\D/g, "");

  return {
    message,
    url: digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : undefined,
    provider: process.env.WHATSAPP_ACCESS_TOKEN ? "whatsapp_cloud_api_ready" : "manual_link",
  };
}
