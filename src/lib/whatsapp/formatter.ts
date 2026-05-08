export class InvalidWhatsAppPhoneError extends Error {
  constructor(phone: string) {
    super(`Invalid Nigerian WhatsApp phone number: ${phone}`);
    this.name = "InvalidWhatsAppPhoneError";
  }
}

export function normalizeNigerianPhoneNumber(phone: string) {
  const digits = phone.trim().replace(/[^\d]/g, "");

  if (/^0[789][01]\d{8}$/.test(digits)) {
    return `234${digits.slice(1)}`;
  }

  if (/^234[789][01]\d{8}$/.test(digits)) {
    return digits;
  }

  if (/^[789][01]\d{8}$/.test(digits)) {
    return `234${digits}`;
  }

  throw new InvalidWhatsAppPhoneError(phone);
}

export function isValidNigerianPhoneNumber(phone: string) {
  try {
    normalizeNigerianPhoneNumber(phone);
    return true;
  } catch {
    return false;
  }
}
