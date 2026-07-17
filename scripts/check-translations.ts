import en from "../src/i18n/locales/en.json";
import fr from "../src/i18n/locales/fr.json";
import ha from "../src/i18n/locales/ha.json";
import ig from "../src/i18n/locales/ig.json";
import sw from "../src/i18n/locales/sw.json";
import yo from "../src/i18n/locales/yo.json";

const baseKeys = Object.keys(en).sort();
const dictionaries = { fr, sw, ha, yo, ig };
const missing: string[] = [];

for (const [locale, dictionary] of Object.entries(dictionaries)) {
  const keys = Object.keys(dictionary).sort();

  for (const key of baseKeys) {
    if (!keys.includes(key)) {
      missing.push(`${locale}:${key}`);
    }
  }
}

if (missing.length > 0) {
  console.error(`Missing translation keys:\n${missing.join("\n")}`);
  process.exit(1);
}

console.log("All translation keys are present.");
