import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://smemoneybook.com";
const socialUrls = [
  "https://www.facebook.com/SMEMoneyBook",
  "https://www.instagram.com/smemoneybook/",
  "https://www.tiktok.com/@smemoneybook",
];

export const metadata: Metadata = {
  title: "SME MoneyBook | Track Every Naira. Grow With Confidence.",
  description:
    "SME MoneyBook helps African small business owners track sales, expenses, debts, inventory, invoices, and cash flow from one simple dashboard.",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: "SME MoneyBook | Simple bookkeeping for African SMEs",
    description:
      "Track sales, expenses, debts, inventory, invoices, and cash flow without accounting knowledge.",
    url: siteUrl,
    siteName: "SME MoneyBook",
    type: "website",
    locale: "en_NG",
  },
  twitter: {
    card: "summary_large_image",
    title: "SME MoneyBook",
    description: "Finally know where your business money goes.",
  },
  keywords: [
    "SME bookkeeping Nigeria",
    "small business accounting Africa",
    "inventory tracker Nigeria",
    "invoice app for SMEs",
    "business cash flow app",
  ],
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SME MoneyBook",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description:
    "A daily money management companion for African small business owners to track sales, expenses, debts, inventory, invoices, and cash flow.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "NGN",
  },
  audience: {
    "@type": "Audience",
    audienceType: "African SME owners",
  },
  sameAs: socialUrls,
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <LandingPage />
    </>
  );
}
