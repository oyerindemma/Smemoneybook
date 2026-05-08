import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Financial Disclaimer | ${legalConfig.productName}`,
  description: `Important limits on ${legalConfig.productName} reports, VAT estimates, exports, and financial information.`,
};

export default function FinancialDisclaimerPage() {
  return (
    <LegalPageLayout
      title="Financial Disclaimer"
      description={`This disclaimer explains the limits of ${legalConfig.productName} financial records, reports, exports, and estimates.`}
    >
      <LegalSection title="1. Informational Purpose">
        <p>
          {legalConfig.productName} provides bookkeeping and financial tracking tools for informational and operational business purposes. The app helps users record money in, money out, invoices, stock, customer records, supplier records, and reports.
        </p>
      </LegalSection>

      <LegalSection title="2. Not Professional Advice">
        <p>
          {legalConfig.productName} does not provide accounting, tax, legal, investment, audit, or financial advice. Information in the app should not be treated as a substitute for advice from a qualified professional.
        </p>
      </LegalSection>

      <LegalSection title="3. Tax/VAT Estimates">
        <p>
          VAT and tax summaries are estimates based on user-entered records and may not reflect official obligations, deductions, exemptions, penalties, or filing requirements.
        </p>
      </LegalSection>

      <LegalSection title="4. User Responsibility">
        <p>
          Users are responsible for reviewing, correcting, and verifying records before filing returns, submitting documents, making business decisions, or relying on reports.
        </p>
      </LegalSection>

      <LegalSection title="5. Professional Review">
        <p>
          Users should consult accountants, auditors, tax professionals, financial advisors, or legal advisors before making formal filings or important business decisions.
        </p>
      </LegalSection>

      <LegalSection title="6. Export Disclaimer">
        <p>
          CSV, PDF, invoice, and report exports are generated from recorded data and should be reviewed for completeness and accuracy before official use.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
