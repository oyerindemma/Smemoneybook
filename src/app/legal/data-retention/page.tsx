import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Data Retention | ${legalConfig.productName}`,
  description: `How ${legalConfig.productName} retains account, business, financial, and payment records.`,
};

export default function DataRetentionPage() {
  return (
    <LegalPageLayout
      title="Data Retention"
      description={`This policy explains how long ${legalConfig.productName} may keep account, business, financial, operational, and payment metadata.`}
    >
      <LegalSection title="1. Purpose">
        <p>Data retention supports account operation, customer support, security, backups, dispute handling, fraud prevention, and legal obligations.</p>
      </LegalSection>
      <LegalSection title="2. Data Retained">
        <ul className="list-disc space-y-2 pl-5">
          <li>Account information and business profile information.</li>
          <li>Financial records, invoices, inventory records, reports, and exports.</li>
          <li>Audit logs, session records, payment metadata, and operational logs.</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. Retention Period">
        <p>Records may be retained while an account is active or as needed for operations, backups, fraud prevention, dispute handling, and legal obligations.</p>
      </LegalSection>
      <LegalSection title="4. Backup Retention">
        <p>Backups may persist temporarily after deletion until scheduled cleanup cycles are completed.</p>
      </LegalSection>
      <LegalSection title="5. Account Deletion">
        <p>
          Users may request account deletion directly within the application settings or by contacting {legalConfig.productName} support at {legalConfig.supportEmail}. When an account deletion request is submitted, {legalConfig.productName} will begin processing the request and may delete or anonymize account data, subject to any legal, security, fraud-prevention, dispute-resolution, backup, or regulatory retention requirements.
        </p>
        <p>
          Some records may remain temporarily within secure backups until scheduled backup cleanup cycles are completed.
        </p>
        <p>
          Where business financial records are required for legal, audit, fraud-prevention, dispute, tax, or regulatory reasons, {legalConfig.productName} may retain limited records for the period reasonably necessary.
        </p>
      </LegalSection>
      <LegalSection title="6. Business Data Export">
        <p>Where supported, users should export records before requesting account deletion or business data deletion.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
