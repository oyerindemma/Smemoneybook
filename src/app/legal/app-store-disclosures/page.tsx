import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `App Store Disclosures | ${legalConfig.productName}`,
  description: `Mobile app data collection and deletion disclosures for ${legalConfig.productName}.`,
};

export default function AppStoreDisclosuresPage() {
  return (
    <LegalPageLayout
      title="App Store Disclosures"
      description={`This page summarizes mobile app disclosure information for ${legalConfig.productName}. It is intended to support app-store review preparation and does not claim official approval.`}
    >
      <LegalSection title="1. Data Collected">
        <p>{legalConfig.productName} may collect account, business, and usage information needed to operate the service.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Name, business name, email address, and phone number where applicable.</li>
          <li>Financial records, invoices, customer and supplier records, stock records, reports, and exports.</li>
          <li>Subscription and payment metadata, such as payment references and plan status.</li>
          <li>Device, session, IP address, usage, error, and security log information.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Why Data Is Collected">
        <p>
          Data is collected to provide bookkeeping, invoicing, inventory tracking, reports, secure login, account support, billing, fraud prevention, abuse detection, and product reliability improvements.
        </p>
      </LegalSection>

      <LegalSection title="3. Encryption and Security">
        <p>
          Data is encrypted in transit using HTTPS/TLS where supported. {legalConfig.productName} also uses operational safeguards such as password hashing, session protection, access controls, monitoring, and secure secret management.
        </p>
      </LegalSection>

      <LegalSection title="4. Account Deletion">
        <p>
          Users can request account deletion in the app settings or by contacting {legalConfig.supportEmail}. Deletion requests may result in deletion or anonymization of account data, subject to legal, security, fraud-prevention, dispute, backup, tax, or regulatory retention requirements.
        </p>
        <p>
          Apple requires apps that support account creation to allow users to initiate account deletion within the app. Google Play requires developers to complete accurate Data Safety disclosures, including account deletion questions, if the app enables account creation.
        </p>
      </LegalSection>

      <LegalSection title="5. Third-Party Processors">
        <p>
          {legalConfig.productName} may use trusted third-party processors for hosting, database services, payments such as Paystack or Stripe, analytics, monitoring, and support tools. Full card details are handled by payment processors and are not stored by {legalConfig.productName}.
        </p>
      </LegalSection>

      <LegalSection title="6. No Official Approval Claim">
        <p>
          These disclosures are prepared to support mobile app readiness. They do not represent certification, legal approval, store approval, or a guarantee of compliance.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
