"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  HeartHandshake,
  LineChart,
  MessageCircle,
  PackageCheck,
  Play,
  ReceiptText,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";

const navItems = ["Features", "Demo", "Pricing", "FAQ"];
const socialLinks = [
  { label: "Facebook", href: "https://www.facebook.com/SMEMoneyBook" },
  { label: "Instagram", href: "https://www.instagram.com/smemoneybook/" },
  { label: "TikTok", href: "https://www.tiktok.com/@smemoneybook" },
] as const;

const painPoints = [
  ["You do not know your actual profit.", LineChart],
  ["Customers owe you and you forget to follow up.", Users],
  ["Business and personal money are mixed together.", WalletCards],
  ["Stock disappears without explanation.", Boxes],
  ["Expenses are not properly tracked.", ReceiptText],
  ["End-of-month calculations are stressful.", Clock3],
] as const;

const features = [
  ["Record Sales", "Capture daily sales in seconds and keep every branch in sync.", CreditCard],
  ["Track Expenses", "Know what leaves the business before small costs become leaks.", ReceiptText],
  ["Manage Customer Debts", "See who owes you, how much, and when to follow up.", Users],
  ["Create Invoices", "Send clean invoices that make your business look established.", FileText],
  ["Manage Inventory", "Track stock movement and spot fast-selling products.", PackageCheck],
  ["Business Reports", "Understand profit, cash flow, and trends without spreadsheets.", BarChart3],
  ["WhatsApp Reminders", "Follow up debts, invoices, and confirmations where customers already are.", MessageCircle],
  ["AI Business Insights", "Get plain-English suggestions from your business activity.", Bot],
] as const;

const demoScreens = [
  {
    name: "Dashboard",
    title: "Today at a glance",
    metric: "NGN 428k",
    rows: ["Sales up 18%", "Expenses steady", "Cash available healthy"],
  },
  {
    name: "Add Sale",
    title: "Record a sale",
    metric: "45 sec",
    rows: ["Choose customer", "Add items", "Save receipt"],
  },
  {
    name: "People & Debts",
    title: "Follow up faster",
    metric: "12 open",
    rows: ["Amina owes NGN 24k", "Kunle paid today", "Reminder ready"],
  },
  {
    name: "Stock",
    title: "Know what moved",
    metric: "83 items",
    rows: ["Rice low stock", "Shoes sold out", "Restock alert"],
  },
  {
    name: "Reports",
    title: "Better decisions",
    metric: "32% margin",
    rows: ["Top product: Drinks", "Best day: Friday", "Export available"],
  },
] as const;

const benefits = [
  "Save Time",
  "Reduce Financial Stress",
  "Stay Organized",
  "Understand Your Profit",
  "Follow Up Customers Faster",
  "Make Better Decisions",
];

const testimonials = [
  {
    name: "Amaka E.",
    type: "Fashion Seller",
    review: "I finally know what I sold, what I spent, and who still needs to pay me.",
    photoPosition: "0% 0%",
  },
  {
    name: "Tunde A.",
    type: "Mini-Mart Owner",
    review: "The stock view helps me catch shortages early. My weekly planning is calmer now.",
    photoPosition: "100% 0%",
  },
  {
    name: "Blessing O.",
    type: "Restaurant Owner",
    review: "Expenses used to disappear in chats and notebooks. Now everything is in one place.",
    photoPosition: "0% 100%",
  },
  {
    name: "Musa I.",
    type: "POS Operator",
    review: "Debt reminders on WhatsApp save me awkward calls and help customers pay faster.",
    photoPosition: "100% 100%",
  },
] as const;

const plans = [
  {
    name: "Free",
    price: "NGN 0",
    detail: "For testing the basics",
    perks: ["Daily sales tracking", "Expense records", "Basic dashboard"],
    featured: false,
  },
  {
    name: "Starter",
    price: "NGN 3,500",
    detail: "For active small teams",
    perks: ["Invoices", "Customer debts", "Inventory alerts"],
    featured: false,
  },
  {
    name: "Growth",
    price: "NGN 7,500",
    detail: "For businesses ready to scale",
    perks: ["Reports", "WhatsApp reminders", "AI business insights"],
    featured: true,
  },
] as const;

const faqs = [
  ["Is SME MoneyBook free?", "Yes. You can start free and upgrade when your business needs more power."],
  ["Do I need accounting knowledge?", "No. SME MoneyBook uses simple business language, not accounting jargon."],
  ["Can I use it on my phone?", "Yes. The experience is mobile-first and works smoothly on modern phones."],
  ["Can I track inventory?", "Yes. You can monitor items, stock movement, and low-stock alerts."],
  ["Can I send invoices?", "Yes. You can create invoices and share them with customers."],
  ["Is my data secure?", "Your records are stored in the cloud with security-first product practices."],
] as const;

export function LandingPage() {
  const [activeScreen, setActiveScreen] = useState(0);
  const selectedScreen = demoScreens[activeScreen];

  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-2 font-semibold" href="/" aria-label="SME MoneyBook home">
            <LogoMark />
            <span>SME MoneyBook</span>
          </Link>
          <div className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            {navItems.map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="hover:text-teal-700">
                {item}
              </a>
            ))}
          </div>
          <Link
            className="hidden rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 hover:bg-teal-700 sm:inline-flex"
            href="/auth"
            data-analytics-event="nav_start_free"
          >
            Start Free
          </Link>
        </nav>
      </header>

      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[540px] bg-[linear-gradient(180deg,#ecfeff_0%,#ffffff_70%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-6 px-4 pb-12 pt-8 sm:gap-10 sm:px-6 sm:pt-14 lg:grid-cols-[1fr_0.92fr] lg:items-center lg:px-8 lg:pb-24">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1.5 text-sm font-semibold text-teal-800 shadow-sm">
              <Sparkles size={16} aria-hidden="true" />
              Track Every Naira. Grow With Confidence.
            </div>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-6xl sm:leading-[1.02] lg:text-7xl">
              Finally Know Where Your Business Money Goes.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Track sales, expenses, customer debts, inventory, invoices and cash flow from one simple dashboard built
              for African SMEs.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-teal-700 px-7 text-base font-semibold text-white shadow-xl shadow-teal-700/20 hover:bg-teal-800"
                href="/auth"
                data-analytics-event="hero_start_free"
              >
                Start Free
                <ArrowRight size={19} aria-hidden="true" />
              </Link>
              <a
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 text-base font-semibold text-slate-800 shadow-sm hover:border-sky-200 hover:text-sky-700"
                href="#demo"
                data-analytics-event="hero_watch_demo"
              >
                <Play size={18} aria-hidden="true" />
                Watch Demo
              </a>
            </div>
            <div className="mt-7 grid gap-3 text-sm font-semibold text-slate-700 sm:grid-cols-3">
              {["No Accounting Knowledge Needed", "Mobile Friendly", "Secure Cloud Storage"].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <Check className="text-teal-700" size={17} aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            className="relative mx-auto flex min-h-[430px] w-full max-w-[560px] items-end justify-center sm:min-h-[620px] lg:min-h-[700px]"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, delay: 0.1 }}
          >
            <Image
              className="absolute bottom-3 right-0 hidden h-auto w-[250px] rotate-6 rounded-[2.5rem] drop-shadow-2xl sm:block lg:w-[300px]"
              src="/images/landing-add-sale-mockup.png"
              alt="SME MoneyBook add sale screen showing product, amount, money location, and customer payment fields."
              width={852}
              height={1846}
              priority
              sizes="(min-width: 1024px) 300px, 250px"
            />
            <Image
              className="relative z-10 h-auto w-[245px] -rotate-2 rounded-[2.5rem] drop-shadow-2xl sm:w-[330px] lg:w-[380px]"
              src="/images/landing-dashboard-mockup.png"
              alt="SME MoneyBook mobile dashboard showing today's sales, expenses, profit, available money, and quick actions."
              width={853}
              height={1844}
              priority
              sizes="(min-width: 1024px) 380px, (min-width: 640px) 330px, 245px"
            />
          </motion.div>
        </div>
      </section>

      <Section id="features" eyebrow="Common headaches" title="Running A Business Is Hard Enough.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {painPoints.map(([text, Icon]) => (
            <article key={text} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <Icon size={21} aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-950">{text}</h3>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="One calm dashboard" title="Everything Your Business Needs In One Place.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(([title, description, Icon], index) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon size={20} aria-hidden="true" />
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-4 font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              <MiniPreview index={index} />
            </article>
          ))}
        </div>
      </Section>

      <Section id="demo" eyebrow="Product demo" title="See SME MoneyBook In Action">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1fr] lg:items-center">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {demoScreens.map((screen, index) => (
              <button
                key={screen.name}
                className={`rounded-2xl border p-4 text-left shadow-sm ${
                  activeScreen === index
                    ? "border-teal-300 bg-teal-50 text-teal-950"
                    : "border-slate-200 bg-white text-slate-700 hover:border-sky-200"
                }`}
                type="button"
                onClick={() => setActiveScreen(index)}
              >
                <span className="text-sm font-semibold">{screen.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{screen.title}</span>
              </button>
            ))}
          </div>
          <div className="mx-auto w-full max-w-[390px]">
            <PhoneFrame>
              <motion.div
                key={selectedScreen.name}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <div className="rounded-3xl bg-slate-950 p-5 text-white">
                  <p className="text-sm text-slate-300">{selectedScreen.title}</p>
                  <p className="mt-3 text-4xl font-semibold">{selectedScreen.metric}</p>
                </div>
                {selectedScreen.rows.map((row) => (
                  <div key={row} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                    <span className="text-sm font-semibold text-slate-700">{row}</span>
                    <Check size={18} className="text-teal-700" aria-hidden="true" />
                  </div>
                ))}
              </motion.div>
            </PhoneFrame>
          </div>
        </div>
      </Section>

      <section className="bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-300">Benefits</p>
              <h2 className="mt-4 text-3xl font-semibold sm:text-5xl">Why Business Owners Love SME MoneyBook</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <Check className="text-amber-300" size={20} aria-hidden="true" />
                  <span className="font-semibold">{benefit}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Section eyebrow="Trusted by growing businesses" title="Built For Real Shops, Stores, And Teams.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((item) => (
            <article key={item.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Image
                className="h-12 w-12 rounded-full object-cover ring-4 ring-slate-50"
                src="/images/testimonial-portraits.png"
                alt={`${item.name}, ${item.type}`}
                width={48}
                height={48}
                loading="lazy"
                style={{ objectPosition: item.photoPosition }}
              />
              <p className="mt-5 text-sm leading-6 text-slate-700">&quot;{item.review}&quot;</p>
              <div className="mt-5">
                <p className="font-semibold text-slate-950">{item.name}</p>
                <p className="text-sm text-slate-500">{item.type}</p>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section eyebrow="How it works" title="Get Started In Minutes">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Create Account", "Open your free account and add your business details."],
            ["Record Transactions", "Capture sales, expenses, debts, invoices, and stock movement."],
            ["Track Business Growth", "Use simple reports to see what is working and what needs attention."],
          ].map(([title, description], index) => (
            <article key={title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-700 font-semibold text-white">
                {index + 1}
              </span>
              <h3 className="mt-5 text-xl font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
            </article>
          ))}
        </div>
      </Section>

      <section className="bg-sky-50 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">WhatsApp advantage</p>
            <h2 className="mt-4 text-3xl font-semibold text-slate-950 sm:text-5xl">
              Built For How African Businesses Operate
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              Send invoices, debt reminders, and payment confirmations through the channel your customers already use
              every day.
            </p>
          </div>
          <div className="rounded-[2rem] border border-sky-100 bg-white p-5 shadow-xl shadow-sky-900/10">
            {[
              ["Invoice sent", "Hi Ada, here is your invoice for today's order."],
              ["Debt reminder", "Good afternoon. Your balance of NGN 18,500 is due tomorrow."],
              ["Payment confirmed", "Thank you. Your payment has been recorded."],
            ].map(([title, text], index) => (
              <div
                key={title}
                className={`mb-3 max-w-[86%] rounded-2xl p-4 ${
                  index === 1 ? "ml-auto bg-teal-700 text-white" : "bg-slate-100 text-slate-800"
                }`}
              >
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-6">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Section id="pricing" eyebrow="Simple pricing" title="Choose The Plan That Fits Today.">
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`rounded-2xl border p-6 shadow-sm ${
                plan.featured
                  ? "border-teal-300 bg-teal-950 text-white shadow-2xl shadow-teal-900/20"
                  : "border-slate-200 bg-white text-slate-950"
              }`}
            >
              {plan.featured ? (
                <span className="rounded-full bg-amber-300 px-3 py-1 text-xs font-bold text-slate-950">Best value</span>
              ) : null}
              <h3 className="mt-5 text-2xl font-semibold">{plan.name}</h3>
              <p className={`mt-2 text-sm ${plan.featured ? "text-teal-100" : "text-slate-500"}`}>{plan.detail}</p>
              <p className="mt-6 text-4xl font-semibold">{plan.price}</p>
              <p className={`mt-1 text-sm ${plan.featured ? "text-teal-100" : "text-slate-500"}`}>per month</p>
              <ul className="mt-6 space-y-3">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-center gap-3 text-sm font-medium">
                    <Check size={18} className={plan.featured ? "text-amber-300" : "text-teal-700"} aria-hidden="true" />
                    {perk}
                  </li>
                ))}
              </ul>
              <Link
                className={`mt-7 inline-flex h-12 w-full items-center justify-center rounded-full font-semibold ${
                  plan.featured ? "bg-white text-teal-950 hover:bg-amber-100" : "bg-slate-950 text-white hover:bg-teal-700"
                }`}
                href="/auth"
                data-analytics-event={`pricing_${plan.name.toLowerCase()}_start`}
              >
                Start Free Today
              </Link>
            </article>
          ))}
        </div>
      </Section>

      <Section id="faq" eyebrow="FAQ" title="Questions Business Owners Ask">
        <div className="mx-auto max-w-3xl divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {faqs.map(([question, answer]) => (
            <details key={question} className="group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-950">
                {question}
                <ChevronDown className="shrink-0 text-slate-400 transition group-open:rotate-180" size={20} />
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{answer}</p>
            </details>
          ))}
        </div>
      </Section>

      <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-slate-950 px-6 py-12 text-center text-white shadow-2xl shadow-slate-950/20 sm:px-10">
          <HeartHandshake className="mx-auto text-amber-300" size={36} aria-hidden="true" />
          <h2 className="mt-5 text-3xl font-semibold sm:text-5xl">Take Control Of Your Business Finances Today</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-slate-300">
            Join the growing community of business owners using SME MoneyBook to track every naira and grow confidently.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link className="inline-flex h-14 items-center justify-center rounded-full bg-white px-7 font-semibold text-slate-950 hover:bg-amber-100" href="/auth">
              Start Free
            </Link>
            <a className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 px-7 font-semibold text-white hover:bg-white/10" href="mailto:hello@smemoneybook.com">
              Book Demo
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <LogoMark />
              SME MoneyBook
            </div>
            <p className="mt-3 text-sm text-slate-500">Simple Bookkeeping. Better Business Growth.</p>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold text-slate-600" aria-label="Footer">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="mailto:hello@smemoneybook.com">Help Center</a>
            <a href="mailto:hello@smemoneybook.com">Contact</a>
            <Link href="/legal/privacy-policy">Privacy Policy</Link>
            <Link href="/legal/terms-of-service">Terms of Service</Link>
          </nav>
          <div className="flex gap-3 text-sm font-semibold text-slate-500">
            {socialLinks.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`SME MoneyBook on ${social.label}`}
              >
                {social.label}
              </a>
            ))}
          </div>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-xl sm:hidden">
        <Link
          className="flex h-14 items-center justify-center gap-2 rounded-full bg-teal-700 font-semibold text-white"
          href="/auth"
          data-analytics-event="sticky_mobile_start_free"
        >
          Start Free
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-9 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-700">{eyebrow}</p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-slate-950 sm:text-5xl">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[2.4rem] border border-slate-200 bg-slate-950 p-3 shadow-2xl shadow-slate-900/20">
      <div className="rounded-[1.9rem] bg-white p-4">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-slate-200" />
        {children}
      </div>
    </div>
  );
}

function MiniPreview({ index }: { index: number }) {
  return (
    <div className="mt-5 rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-teal-600" />
        <span className="h-2 w-10 rounded-full bg-slate-200" />
      </div>
      <div className="mt-4 grid grid-cols-3 items-end gap-2">
        {[34, 58, 46].map((height, barIndex) => (
          <span
            key={`${index}-${barIndex}`}
            className="rounded-t-md bg-sky-200"
            style={{ height: `${height + index * 3}px` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
