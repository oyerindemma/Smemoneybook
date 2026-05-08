import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Data Security | ${legalConfig.productName}`,
  description: `Security practices used to help protect ${legalConfig.productName} data.`,
};

export default function DataSecurityPage() {
  return (
    <LegalPageLayout
      title="Data Security"
      description={`This page summarizes the safeguards ${legalConfig.productName} uses to help protect business and account data.`}
    >
      <LegalSection title="1. Security Commitment">
        <p>{legalConfig.productName} is designed to protect sensitive business financial records, customer records, supplier records, inventory records, and payment metadata.</p>
      </LegalSection>
      <LegalSection title="2. Technical Safeguards">
        <ul className="list-disc space-y-2 pl-5">
          <li>HTTPS/TLS for encrypted connections.</li>
          <li>Password hashing and session protection.</li>
          <li>Environment secret management and database access control.</li>
          <li>Audit logging for sensitive business actions.</li>
          <li>Rate limiting, monitoring, and error logs to detect abuse or failures.</li>
        </ul>
      </LegalSection>
      <LegalSection title="3. Payment Security">
        <p>Full card details are handled by payment processors. {legalConfig.productName} stores payment metadata needed for subscription and billing records.</p>
      </LegalSection>
      <LegalSection title="4. User Responsibilities">
        <p>Users should use strong passwords, secure their devices, avoid sharing login credentials, and report suspected unauthorized access promptly.</p>
      </LegalSection>
      <LegalSection title="5. Incident Response">
        <p>If a security incident occurs, {legalConfig.productName} will investigate, mitigate, and notify affected users where required by applicable law or platform obligations in the {legalConfig.jurisdiction}.</p>
      </LegalSection>
      <LegalSection title="6. Limitations">
        <p>No system is 100% secure. Users should keep independent business records and follow good security practices.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
