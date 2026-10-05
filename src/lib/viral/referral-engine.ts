import { formatNaira, type MoneybookState, type MonthlyReport } from "@/lib/bookkeeping/transaction-engine";
import { buildRetentionEngine } from "@/lib/retention/retention-engine";

const appName = "SME MoneyBook";

export function getReferralCode(input: { businessId?: string; businessName?: string }) {
  const base = input.businessName || input.businessId || "SME";
  const readable = base
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const suffix = input.businessId?.slice(-4).toUpperCase() ?? "BOOK";
  return `${readable || "SME"}${suffix}`;
}

export function getReferralLink(input: {
  origin?: string;
  businessId?: string;
  businessName?: string;
}) {
  const origin = input.origin || process.env.NEXT_PUBLIC_APP_URL || "https://smemoneybook.com";
  const code = getReferralCode(input);
  return `${origin.replace(/\/$/, "")}/?ref=${encodeURIComponent(code)}`;
}

export function getReferralRewards() {
  return {
    referrer: ["Free premium days", "Invoice credits", "AI insights unlock", "Business reports unlock"],
    newUser: ["Onboarding bonus", "Premium trial", "Free invoice credits"],
  };
}

export function buildReferralShareText(input: {
  businessName?: string;
  referralLink: string;
}) {
  return `I use ${appName} to track my business money daily without stress. Try it free: ${input.referralLink}`;
}

export function buildReportShareText(report: MonthlyReport, referralLink: string) {
  const topCategory = report.categoryBreakdown[0]
    ? `\nTop category: ${report.categoryBreakdown[0].name}`
    : "";

  return `${report.periodLabel} business update:\nSales: ${formatNaira(report.salesTotal)}\nExpenses: ${formatNaira(report.expensesTotal)}\nProfit: ${formatNaira(report.profitTotal)}${topCategory}\n\nTracked using ${appName}.\n${referralLink}`;
}

export function buildViralMomentShareText(state: MoneybookState, referralLink: string) {
  const retention = buildRetentionEngine(state);
  const moment =
    retention.businessMoments[0] ??
    (retention.weeklyReport.totalProfit > 0
      ? `My business made ${formatNaira(retention.weeklyReport.totalProfit)} profit this week.`
      : `My business health score is ${retention.businessHealth.score}/100.`);

  return `${moment}\nTracked using ${appName}.\n${referralLink}`;
}

export function getWhatsAppShareUrl(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
