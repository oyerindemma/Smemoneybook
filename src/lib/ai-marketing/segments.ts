import {
  getMarketingEligibility,
  normalizeMarketingConsentStatus,
  normalizeMarketingChannel,
  type AiMarketingChannel,
} from "@/lib/ai-marketing/consent";

export const aiMarketingSegmentVersion = "phase3h-ai-marketing-segments-v1";
export const highValueCustomerThresholdKobo = 100_000;
export const dormantCustomerDays = 90;

export const aiMarketingSegmentKeys = [
  "new_customers",
  "frequent_customers",
  "high_value_customers",
  "dormant_customers",
  "repeat_customers",
  "unpaid_invoices",
  "overdue_debt",
  "purchased_product_category",
  "active_in_range",
  "verified_marketing_consent",
] as const;

export type AiMarketingSegmentKey = (typeof aiMarketingSegmentKeys)[number];

export type MarketingCustomerProfile = {
  id: string;
  name: string;
  phone?: string | null;
  createdAt: Date | string;
  marketingConsentStatus?: string | null;
  marketingOptOutAt?: Date | string | null;
  preferredChannel?: string | null;
  doNotContact?: boolean | null;
  transactions?: MarketingCustomerTransaction[];
  debts?: MarketingCustomerDebt[];
  issuedDocuments?: MarketingIssuedDocument[];
};

export type MarketingCustomerTransaction = {
  id?: string;
  type?: string | null;
  amount: number;
  occurredAt: Date | string;
  paymentStatus?: string | null;
  productName?: string | null;
  productCategory?: string | null;
};

export type MarketingCustomerDebt = {
  id?: string;
  type?: string | null;
  status?: string | null;
  amount: number;
  paidAmount?: number | null;
  dueAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type MarketingIssuedDocument = {
  id?: string;
  status?: string | null;
  total: number;
  balanceDue: number;
  dueDate?: Date | string | null;
  createdAt?: Date | string | null;
};

export type AiMarketingSegment = {
  key: AiMarketingSegmentKey;
  label: string;
  definition: string;
  period: {
    start: string;
    end: string;
    label: string;
  };
  customerCount: number;
  consentEligibleCount: number;
  excludedCount: number;
  dataLimitations: string[];
  matchingCustomerIds: string[];
  recipientIds: string[];
  breakdown?: Record<string, number>;
};

export function calculateAiMarketingSegments({
  customers,
  periodStart,
  periodEnd,
  generatedAt = new Date(),
}: {
  customers: MarketingCustomerProfile[];
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
}): AiMarketingSegment[] {
  const context = {
    customers,
    periodStart,
    periodEnd,
    generatedAt,
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      label: `${periodStart.toISOString().slice(0, 10)} to ${periodEnd.toISOString().slice(0, 10)}`,
    },
  };

  return [
    buildSegment({
      ...context,
      key: "new_customers",
      label: "New customers",
      definition: "Customers created during the selected date range.",
      customers: customers.filter((customer) => inPeriod(customer.createdAt, periodStart, periodEnd)),
      dataLimitations: ["Customer creation date may not match first purchase date for imported records."],
    }),
    buildSegment({
      ...context,
      key: "frequent_customers",
      label: "Frequent customers",
      definition: "Customers with at least three recorded sales during the selected date range.",
      customers: customers.filter((customer) => salesInPeriod(customer, periodStart, periodEnd).length >= 3),
      dataLimitations: ["Cash sales without a customer name cannot be attributed to this segment."],
    }),
    buildSegment({
      ...context,
      key: "high_value_customers",
      label: "High-value customers",
      definition: `Customers with recorded sales of at least NGN ${formatNaira(highValueCustomerThresholdKobo)} during the selected date range.`,
      customers: customers.filter((customer) => saleTotal(salesInPeriod(customer, periodStart, periodEnd)) >= highValueCustomerThresholdKobo),
      dataLimitations: ["This uses recorded purchase value only and does not infer income or personal wealth."],
    }),
    buildSegment({
      ...context,
      key: "dormant_customers",
      label: "Dormant customers",
      definition: `Customers with prior sales but no recorded sale in the last ${dormantCustomerDays} days.`,
      customers: customers.filter((customer) => isDormantCustomer(customer, generatedAt)),
      dataLimitations: ["Dormancy is based only on recorded sales in SME MoneyBook."],
    }),
    buildSegment({
      ...context,
      key: "repeat_customers",
      label: "Repeat customers",
      definition: "Customers with at least two recorded sales at any time.",
      customers: customers.filter((customer) => allSales(customer).length >= 2),
      dataLimitations: ["Repeat purchase history is limited to recorded customer-linked sales."],
    }),
    buildSegment({
      ...context,
      key: "unpaid_invoices",
      label: "Customers with unpaid invoices",
      definition: "Customers with an unpaid or credit sale, or an issued document with balance due.",
      customers: customers.filter(hasUnpaidInvoiceOrCreditSale),
      dataLimitations: ["Invoice coverage depends on documents and payment status captured in SME MoneyBook."],
    }),
    buildSegment({
      ...context,
      key: "overdue_debt",
      label: "Customers with overdue debt",
      definition: "Customers with open customer debt due before today.",
      customers: customers.filter((customer) => hasOverdueDebt(customer, generatedAt)),
      dataLimitations: ["Debt due dates must be recorded to detect overdue balances."],
    }),
    buildSegment({
      ...context,
      key: "purchased_product_category",
      label: "Purchased product or category",
      definition: "Customers with recorded purchases linked to a product or category.",
      customers: customers.filter((customer) => purchasedProductCategories(customer).length > 0),
      dataLimitations: ["Category grouping is available only when sale records are linked to products or categories."],
      breakdown: buildProductCategoryBreakdown(customers),
    }),
    buildSegment({
      ...context,
      key: "active_in_range",
      label: "Active in selected range",
      definition: "Customers with at least one recorded sale during the selected date range.",
      customers: customers.filter((customer) => salesInPeriod(customer, periodStart, periodEnd).length > 0),
      dataLimitations: ["Activity excludes unattributed cash sales."],
    }),
    buildSegment({
      ...context,
      key: "verified_marketing_consent",
      label: "Verified marketing consent",
      definition: "Customers with explicit marketing consent and a usable preferred contact channel.",
      customers: customers.filter((customer) => {
        const eligibility = getMarketingEligibility({
          consentStatus: customer.marketingConsentStatus,
          optOutAt: customer.marketingOptOutAt,
          doNotContact: customer.doNotContact,
          preferredChannel: customer.preferredChannel,
          phone: customer.phone,
        });
        return eligibility.eligibilityStatus === "eligible";
      }),
      dataLimitations: ["Existing customers default to unknown consent until valid consent evidence is recorded."],
    }),
  ];
}

export function getMarketingSegment(
  segments: AiMarketingSegment[],
  key: string,
): AiMarketingSegment | null {
  return segments.find((segment) => segment.key === key) ?? null;
}

export function serializeMarketingSegmentDefinition(segment: AiMarketingSegment) {
  return {
    version: aiMarketingSegmentVersion,
    segmentKey: segment.key,
    label: segment.label,
    definition: segment.definition,
    period: segment.period,
    customerCount: segment.customerCount,
    consentEligibleCount: segment.consentEligibleCount,
    excludedCount: segment.excludedCount,
    dataLimitations: segment.dataLimitations,
    breakdown: segment.breakdown ?? {},
  };
}

export function customerMarketingEligibility(customer: MarketingCustomerProfile) {
  return getMarketingEligibility({
    consentStatus: normalizeMarketingConsentStatus(customer.marketingConsentStatus),
    optOutAt: customer.marketingOptOutAt,
    doNotContact: customer.doNotContact,
    preferredChannel: normalizeMarketingChannel(customer.preferredChannel) as AiMarketingChannel,
    phone: customer.phone,
  });
}

function buildSegment({
  key,
  label,
  definition,
  period,
  customers,
  dataLimitations,
  breakdown,
}: {
  key: AiMarketingSegmentKey;
  label: string;
  definition: string;
  period: AiMarketingSegment["period"];
  customers: MarketingCustomerProfile[];
  dataLimitations: string[];
  breakdown?: Record<string, number>;
}): AiMarketingSegment {
  const eligibility = customers.map((customer) => ({
    customerId: customer.id,
    eligibility: customerMarketingEligibility(customer),
  }));
  const recipientIds = eligibility
    .filter((item) => item.eligibility.eligibilityStatus === "eligible")
    .map((item) => item.customerId);

  return {
    key,
    label,
    definition,
    period,
    customerCount: customers.length,
    consentEligibleCount: recipientIds.length,
    excludedCount: Math.max(0, customers.length - recipientIds.length),
    dataLimitations,
    matchingCustomerIds: customers.map((customer) => customer.id),
    recipientIds,
    breakdown,
  };
}

function allSales(customer: MarketingCustomerProfile) {
  return (customer.transactions ?? []).filter((transaction) => normalize(transaction.type) === "sale");
}

function salesInPeriod(customer: MarketingCustomerProfile, start: Date, end: Date) {
  return allSales(customer).filter((transaction) => inPeriod(transaction.occurredAt, start, end));
}

function saleTotal(transactions: MarketingCustomerTransaction[]) {
  return transactions.reduce((sum, transaction) => sum + cleanAmount(transaction.amount), 0);
}

function isDormantCustomer(customer: MarketingCustomerProfile, generatedAt: Date) {
  const sales = allSales(customer);

  if (sales.length === 0) {
    return false;
  }

  const cutoff = addDays(generatedAt, -dormantCustomerDays);
  const latestSale = sales
    .map((transaction) => toDate(transaction.occurredAt))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return latestSale < cutoff;
}

function hasUnpaidInvoiceOrCreditSale(customer: MarketingCustomerProfile) {
  const hasCreditSale = allSales(customer).some((transaction) => {
    const status = normalize(transaction.paymentStatus);
    return status === "credit" || status === "unpaid";
  });
  const hasBalanceDue = (customer.issuedDocuments ?? []).some((document) => cleanAmount(document.balanceDue) > 0);

  return hasCreditSale || hasBalanceDue;
}

function hasOverdueDebt(customer: MarketingCustomerProfile, generatedAt: Date) {
  return (customer.debts ?? []).some((debt) => {
    const status = normalize(debt.status);
    const type = normalize(debt.type);
    const dueAt = debt.dueAt ? toDate(debt.dueAt) : null;
    const remaining = cleanAmount(debt.amount) - cleanAmount(debt.paidAmount ?? 0);

    return type === "customer_owes_business" && status === "open" && remaining > 0 && Boolean(dueAt && dueAt < generatedAt);
  });
}

function purchasedProductCategories(customer: MarketingCustomerProfile) {
  return allSales(customer).flatMap((transaction) => [
    transaction.productCategory?.trim(),
    transaction.productName?.trim(),
  ]).filter(Boolean) as string[];
}

function buildProductCategoryBreakdown(customers: MarketingCustomerProfile[]) {
  const counts = new Map<string, Set<string>>();

  for (const customer of customers) {
    for (const label of purchasedProductCategories(customer)) {
      const key = label.toLowerCase();
      counts.set(key, counts.get(key) ?? new Set());
      counts.get(key)?.add(customer.id);
    }
  }

  return Object.fromEntries(
    Array.from(counts.entries())
      .sort((left, right) => right[1].size - left[1].size)
      .slice(0, 8)
      .map(([label, ids]) => [label, ids.size]),
  );
}

function inPeriod(value: Date | string | null | undefined, start: Date, end: Date) {
  if (!value) {
    return false;
  }

  const date = toDate(value);
  return date >= start && date < end;
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function cleanAmount(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function normalize(value?: string | null) {
  return value?.toLowerCase() ?? "";
}

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
