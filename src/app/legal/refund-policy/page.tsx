import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Refund Policy | ${legalConfig.productName}`,
  description: `Refund eligibility and request process for ${legalConfig.productName} subscriptions.`,
};

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout
      title="Refund Policy"
      description="This policy explains when subscription refunds may be available and how users can request billing support."
    >
      <LegalSection title="1. Overview">
        <p>{legalConfig.productName} aims to handle billing issues fairly while keeping subscription access clear and predictable.</p>
      </LegalSection>
      <LegalSection title="2. Eligible Refunds">
        <ul className="list-disc space-y-2 pl-5">
          <li>Duplicate charges.</li>
          <li>Billing errors.</li>
          <li>Failed subscription activation after successful payment.</li>
          <li>Verified unauthorized charges.</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. Non-Refundable Cases">
        <ul className="list-disc space-y-2 pl-5">
          <li>Completed billing cycles.</li>
          <li>Unused subscription periods after access was provided.</li>
          <li>Cancellation after renewal.</li>
          <li>User error, unless a refund is required by law.</li>
        </ul>
      </LegalSection>
      <LegalSection title="4. Refund Request Process">
        <p>Contact {legalConfig.billingEmail} with your account email, payment reference, and reason for the request.</p>
      </LegalSection>
      <LegalSection title="5. Processing Time">
        <p>Refund timing depends on the payment processor, card network, bank, or mobile payment provider involved.</p>
      </LegalSection>
      <LegalSection title="6. Chargebacks">
        <p>Please contact support before starting a chargeback so we can investigate and resolve the issue quickly.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
