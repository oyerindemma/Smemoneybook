import type { Locale } from "@/i18n";

const localeMap: Record<Locale, string> = {
  en: "en-NG",
  fr: "fr-FR",
  sw: "sw-KE",
  ha: "ha-NG",
  yo: "yo-NG",
  ig: "ig-NG",
};

export function formatLocalizedCurrency(amount: number, currency = "NGN", locale: Locale = "en") {
  return new Intl.NumberFormat(localeMap[locale] ?? "en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatLocalizedDate(value: string | Date, locale: Locale = "en") {
  return new Intl.DateTimeFormat(localeMap[locale] ?? "en-NG", {
    dateStyle: "medium",
  }).format(new Date(value));
}
