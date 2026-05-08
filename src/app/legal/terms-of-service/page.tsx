import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Terms of Service | ${legalConfig.productName}`,
  description: `Terms governing access to and use of ${legalConfig.productName}.`,
};

export default function TermsOfServicePage() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      description={`These terms explain the rules for using ${legalConfig.productName} and the responsibilities of users who manage business records in the app.`}
    >
      <LegalSection title="1. Acceptance of Terms">
        <p>By creating an account or using {legalConfig.productName}, you agree to these Terms of Service.</p>
      </LegalSection>
      <LegalSection title="2. Service Description">
        <p>{legalConfig.productName} provides bookkeeping, money tracking, invoices, inventory, reports, billing, and related SME tools.</p>
      </LegalSection>
      <LegalSection title="3. Eligibility">
        <p>You must be able to legally operate a business or represent a business to use {legalConfig.productName}.</p>
      </LegalSection>
      <LegalSection title="4. User Responsibilities">
        <p>You are responsible for the accuracy, completeness, and legality of records entered into the app.</p>
      </LegalSection>
      <LegalSection title="5. Account Security">
        <p>You are responsible for protecting login credentials and notifying {legalConfig.productName} if you suspect unauthorized access.</p>
      </LegalSection>
      <LegalSection title="6. Subscription and Billing">
        <p>Paid features may require a subscription. Failed or disputed payments may restrict access to premium features.</p>
      </LegalSection>
      <LegalSection title="7. Acceptable Use">
        <p>You may not use {legalConfig.productName} for fraud, abuse, unauthorized access, unlawful activity, reverse engineering, or platform misuse.</p>
      </LegalSection>
      <LegalSection title="8. Service Availability">
        <p>We aim to provide reliable access, but we do not guarantee uninterrupted uptime or error-free operation.</p>
      </LegalSection>
      <LegalSection title="9. Intellectual Property">
        <p>{legalConfig.legalName} owns the software, branding, UI, workflows, and platform materials, except for user-owned business data.</p>
      </LegalSection>
      <LegalSection title="10. Termination">
        <p>Accounts may be suspended or terminated for abuse, fraud, payment issues, security risks, or violations of these terms.</p>
      </LegalSection>
      <LegalSection title="11. Limitation of Liability">
        <p>{legalConfig.productName} is not liable for business losses, tax filing errors, accounting inaccuracies, or decisions made based on app reports.</p>
      </LegalSection>
      <LegalSection title="12. Governing Law and Disputes">
        <p>These Terms shall be governed by and interpreted in accordance with the laws of the {legalConfig.jurisdiction}.</p>
        <p>
          Any dispute arising from the use of {legalConfig.productName} shall first be addressed through good-faith resolution between the parties before any formal legal process is pursued.
        </p>
      </LegalSection>
      <LegalSection title="13. Contact">
        <p>For support or terms questions, contact {legalConfig.supportEmail}.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
