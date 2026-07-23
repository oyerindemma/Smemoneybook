export type TaxPeriodInput = {
  month?: string | number | null;
  year?: string | number | null;
  quarter?: string | number | null;
  frequency?: string | null;
  from?: string | null;
  to?: string | null;
};

export function resolveTaxPeriod(input: TaxPeriodInput, now = new Date()) {
  const frequency = normalizeFrequency(input.frequency);
  const custom = resolveCustomPeriod(input.from, input.to);

  if (custom) {
    return { ...custom, filingFrequency: "CUSTOM" };
  }

  const year = coerceInt(input.year, now.getUTCFullYear(), 2020, 2100);

  if (frequency === "ANNUAL") {
    return {
      periodStart: new Date(Date.UTC(year, 0, 1)),
      periodEnd: new Date(Date.UTC(year + 1, 0, 1)),
      filingFrequency: "ANNUAL",
    };
  }

  if (frequency === "QUARTERLY") {
    const quarter = coerceInt(input.quarter, Math.floor(now.getUTCMonth() / 3) + 1, 1, 4);
    const startMonth = (quarter - 1) * 3;
    return {
      periodStart: new Date(Date.UTC(year, startMonth, 1)),
      periodEnd: new Date(Date.UTC(year, startMonth + 3, 1)),
      filingFrequency: "QUARTERLY",
    };
  }

  const month = coerceInt(input.month, now.getUTCMonth() + 1, 1, 12);
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 1)),
    filingFrequency: "MONTHLY",
  };
}

export function listTaxPeriods(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;

  return {
    currentMonth: resolveTaxPeriod({ month, year, frequency: "MONTHLY" }, now),
    currentQuarter: resolveTaxPeriod({ quarter, year, frequency: "QUARTERLY" }, now),
    currentYear: resolveTaxPeriod({ year, frequency: "ANNUAL" }, now),
  };
}

function normalizeFrequency(value?: string | null) {
  const normalized = (value ?? "MONTHLY").trim().toUpperCase();
  return ["MONTHLY", "QUARTERLY", "ANNUAL"].includes(normalized) ? normalized : "MONTHLY";
}

function resolveCustomPeriod(from?: string | null, to?: string | null) {
  if (!from && !to) {
    return null;
  }

  const periodStart = from ? new Date(from) : null;
  const periodEnd = to ? new Date(to) : null;

  if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return null;
  }

  if (periodStart >= periodEnd) {
    return null;
  }

  return { periodStart, periodEnd };
}

function coerceInt(value: string | number | null | undefined, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
