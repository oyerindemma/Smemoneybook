import { TaxAssistantDomainError } from "@/lib/tax-assistant/api";
import {
  calculateTaxAssistantForBusiness,
  type TaxAssistantScope,
} from "@/lib/tax-assistant/service";

export { calculateTaxAssistantForBusiness, type TaxAssistantScope };

export async function saveTaxAssistantSnapshot(): Promise<never> {
  throw new TaxAssistantDomainError(
    "Tax Assistant is read-only in Preview and does not save snapshots.",
    405,
    "read_only",
  );
}
