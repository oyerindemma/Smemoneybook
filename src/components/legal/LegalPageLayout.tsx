import Link from "next/link";
import { legalConfig } from "@/lib/legal/legal-config";

export function LegalPageLayout({
  title,
  effectiveDate = legalConfig.effectiveDate,
  description,
  children,
}: {
  title: string;
  effectiveDate?: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-textPrimary md:py-14">
      <article className="mx-auto max-w-4xl">
        <Link className="text-sm font-semibold text-primary hover:text-primaryHover" href="/legal">
          Back to Legal
        </Link>

        <header className="mt-6 rounded-2xl border border-gray-100 bg-card p-6 shadow-sm md:p-8">
          <p className="text-sm text-textSecondary">Effective date: {effectiveDate}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-textSecondary md:text-base">
            {description}
          </p>
          <p className="mt-4 rounded-xl bg-background p-4 text-sm leading-6 text-textSecondary">
            Legal entity: {legalConfig.legalName}. Business location: {legalConfig.businessAddress}.
            Jurisdiction: {legalConfig.jurisdiction}.
          </p>
        </header>

        <div className="mt-8 space-y-6">{children}</div>

        <footer className="mt-8 rounded-2xl border border-gray-100 bg-card p-6 text-sm leading-6 text-textSecondary shadow-sm">
          <p>Last updated: {effectiveDate}</p>
          <p className="mt-3">{legalConfig.reviewNotice}</p>
        </footer>
      </article>
    </main>
  );
}
