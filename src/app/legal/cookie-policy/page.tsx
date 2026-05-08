import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal/LegalPageLayout";
import { LegalSection } from "@/components/legal/LegalSection";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Cookie Policy | ${legalConfig.productName}`,
  description: `How ${legalConfig.productName} uses cookies and similar technologies for login, security, preferences, and platform performance.`,
};

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      description={`This Cookie Policy explains how ${legalConfig.productName} uses cookies and similar technologies to keep the service secure, reliable, and easy to use.`}
    >
      <LegalSection title="1. What Cookies Are">
        <p>
          Cookies are small text files stored on your browser or device. They help websites remember sessions, preferences, and security information so the service can work properly.
        </p>
      </LegalSection>

      <LegalSection title="2. Types of Cookies Used">
        <p>{legalConfig.productName} may use the following types of cookies:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Essential cookies required for the app to function.</li>
          <li>Authentication and session cookies used to keep users signed in securely.</li>
          <li>Preference cookies used to remember app choices where supported.</li>
          <li>Analytics or performance cookies used to understand and improve platform reliability.</li>
          <li>Security cookies used to protect accounts and detect suspicious activity.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Why We Use Cookies">
        <p>
          We use cookies for login, session security, account protection, user preferences, analytics, performance measurement, and improving the {legalConfig.productName} platform.
        </p>
      </LegalSection>

      <LegalSection title="4. Third-Party Cookies">
        <p>
          Payment processors, analytics providers, error monitoring tools, or support tools may use cookies or similar technologies when their services are connected to {legalConfig.productName}.
        </p>
      </LegalSection>

      <LegalSection title="5. Managing Cookies">
        <p>
          Users can manage cookies through browser settings. Disabling essential cookies may prevent login, session security, or core app features from working correctly.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
