import type { Metadata } from "next";
import { LegalCard } from "@/components/legal/LegalCard";
import { legalConfig } from "@/lib/legal/legal-config";

export const metadata: Metadata = {
  title: `Legal | ${legalConfig.productName}`,
  description: `Policies and terms for ${legalConfig.productName} users.`,
};

const documents = [
  {
    title: "Privacy Policy",
    description: `How ${legalConfig.productName} collects, uses, protects, and shares information.`,
    href: "/legal/privacy-policy",
  },
  {
    title: "Terms of Service",
    description: `The terms that govern use of ${legalConfig.productName}.`,
    href: "/legal/terms-of-service",
  },
  {
    title: "Data Security",
    description: "Security practices for protecting business financial data.",
    href: "/legal/data-security",
  },
  {
    title: "Data Retention",
    description: "How long account, financial, operational, and payment records may be kept.",
    href: "/legal/data-retention",
  },
  {
    title: "Refund Policy",
    description: "When subscription refunds may be available and how to request one.",
    href: "/legal/refund-policy",
  },
  {
    title: "Cookie Policy",
    description: "How cookies and similar technologies support login, security, and analytics.",
    href: "/legal/cookie-policy",
  },
  {
    title: "Financial Disclaimer",
    description: "Important limits on bookkeeping, report, VAT, tax, and export information.",
    href: "/legal/financial-disclaimer",
  },
  {
    title: "App Store Disclosures",
    description: "Mobile app data collection, deletion, encryption, and third-party processor disclosures.",
    href: "/legal/app-store-disclosures",
  },
];

export default function LegalIndexPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-textPrimary md:py-14">
      <section className="mx-auto max-w-4xl">
        <p className="text-sm text-textSecondary">{legalConfig.productName}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Legal</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-textSecondary md:text-base">
          Policies and terms for {legalConfig.productName} users.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {documents.map((document) => (
            <LegalCard key={document.href} {...document} />
          ))}
        </div>
      </section>
    </main>
  );
}
