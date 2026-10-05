import en from "@/i18n/locales/en.json";
import fr from "@/i18n/locales/fr.json";
import ha from "@/i18n/locales/ha.json";
import ig from "@/i18n/locales/ig.json";
import sw from "@/i18n/locales/sw.json";
import yo from "@/i18n/locales/yo.json";

export const locales = { en, fr, sw, ha, yo, ig } as const;
export type Locale = keyof typeof locales;
export type TranslationKey = keyof typeof en;

export function translate(locale: string | undefined, key: TranslationKey) {
  const dictionary = locales[(locale as Locale) || "en"] ?? locales.en;
  return dictionary[key] ?? locales.en[key] ?? key;
}
