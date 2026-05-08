import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Privacy Policy | ${legalConfig.productName}`,
  description: `How ${legalConfig.productName} collects, uses, protects, and shares user and business data.`,
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description={`This Privacy Policy explains how ${legalConfig.productName} handles personal, business, financial, invoice, inventory, report, and billing information.`}
    >
      <LegalSection title="1. Introduction">
        <p>
          {legalConfig.productName} collects and processes information to provide bookkeeping, invoicing, inventory, reporting, billing, account management, and customer support services for small and medium-sized businesses.
        </p>
      </LegalSection>

      <LegalSection title="2. Information We Collect">
        <p>We may collect the following information when you use {legalConfig.productName}:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Name, business name, email address, and phone number where applicable.</li>
          <li>Password credentials stored securely as hashes.</li>
          <li>Income and expense records, invoices, customer and supplier records, inventory and stock records, reports, and exports.</li>
          <li>Subscription and payment metadata, including plan, payment reference, and billing status.</li>
          <li>Device and usage information, IP address, session logs, and security activity.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. How We Use Information">
        <p>We use information to provide bookkeeping services, generate reports, sync records, process billing, improve the product, secure accounts, detect abuse or fraud, and provide customer support.</p>
      </LegalSection>

      <LegalSection title="4. Data Ownership">
        <p>Businesses retain ownership of their financial and operational data entered into {legalConfig.productName}.</p>
      </LegalSection>

      <LegalSection title="5. Data Sharing">
        <p>
          {legalConfig.productName} does not sell customer financial data. We may share limited information with trusted processors that help operate the service, including hosting providers, database providers, payment processors such as Paystack or Stripe, and analytics or error monitoring tools where used.
        </p>
      </LegalSection>

      <LegalSection title="6. Payment Data">
        <p>
          {legalConfig.productName} does not store full card numbers. Payments are processed by third-party payment processors, and we store only payment metadata needed to confirm subscriptions, references, and billing status.
        </p>
      </LegalSection>

      <LegalSection title="7. Data Security">
        <p>
          We use safeguards such as HTTPS, password hashing, access controls, audit logs, secure secret management, monitoring, and operational controls designed to protect accounts and business records.
        </p>
      </LegalSection>

      <LegalSection title="8. Account Deletion">
        <p>
          Users may request account deletion directly within the application settings or by contacting {legalConfig.productName} support at {legalConfig.privacyEmail}. When an account deletion request is submitted, {legalConfig.productName} will begin processing the request and may delete or anonymize account data, subject to any legal, security, fraud-prevention, dispute-resolution, backup, or regulatory retention requirements.
        </p>
        <p>
          Some records may remain temporarily within secure backups until scheduled backup cleanup cycles are completed.
        </p>
        <p>
          Where business financial records are required for legal, audit, fraud-prevention, dispute, tax, or regulatory reasons, {legalConfig.productName} may retain limited records for the period reasonably necessary.
        </p>
        <p>
          If {legalConfig.productName} is distributed as a mobile app with account creation, users should also be able to initiate account deletion in-app, as required by Apple App Store guidelines. Google Play data safety disclosures should accurately describe the data collected and how it is used.
        </p>
      </LegalSection>

      <LegalSection title="9. Data Retention">
        <p>
          Some data may be retained temporarily for backups, audit records, fraud prevention, dispute handling, security, or legal obligations after account closure or deletion requests.
        </p>
      </LegalSection>

      <LegalSection title="10. Contact">
        <p>For privacy questions or requests, contact {legalConfig.privacyEmail}.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
