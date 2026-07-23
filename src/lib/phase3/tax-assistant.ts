import {
  taxAssistantRuleSetVersion,
  type TaxAssistantSummary,
} from "@/lib/tax-assistant/definitions";
import {
  calculateTaxAssistantSummary,
  type TaxCalculationInput,
} from "@/lib/tax-assistant/calculator";

export const taxAssistantRuleVersion = taxAssistantRuleSetVersion;

export {
  calculateTaxAssistantSummary,
  taxAssistantRuleSetVersion,
  type TaxAssistantSummary,
  type TaxCalculationInput as TaxAssistantInput,
};
