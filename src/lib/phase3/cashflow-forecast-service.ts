import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  calculateCashflowForecast,
  cashflowForecastFormulaVersion,
  cashflowForecastHorizons,
  type CashflowForecastSummary,
  type CashflowHorizonDays,
} from "@/lib/phase3/cashflow-forecast";

export type CashflowForecastScope = {
  businessId: string;
  locationId?: string;
  now?: Date;
  horizons?: CashflowHorizonDays[];
};

export async function calculateCashflowForecastForBusiness({
  businessId,
  locationId,
  now = new Date(),
  horizons,
}: CashflowForecastScope): Promise<CashflowForecastSummary> {
  const periodStart = addDays(now, -420);

  const [business, transactions, debts, accounts] = await Promise.all([
    getPrisma().business.findUniqueOrThrow({
      where: { id: businessId },
      select: { id: true, createdAt: true },
    }),
    getPrisma().transaction.findMany({
      where: {
        businessId,
        ...(locationId ? { locationId } : {}),
        occurredAt: { gte: periodStart, lt: now },
      },
      select: {
        type: true,
        amount: true,
        paymentStatus: true,
        occurredAt: true,
        description: true,
        category: true,
        customerId: true,
        supplierId: true,
        reversalTransaction: { select: { id: true } },
      },
    }),
    getPrisma().debt.findMany({
      where: {
        businessId,
        status: "OPEN",
        ...(locationId ? { sourceTransaction: { locationId } } : {}),
      },
      select: {
        type: true,
        amount: true,
        paidAmount: true,
        status: true,
        dueAt: true,
        createdAt: true,
        customerId: true,
        supplierId: true,
      },
    }),
    getPrisma().account.findMany({
      where: { businessId },
      select: { balance: true },
    }),
  ]);

  return calculateCashflowForecast({
    businessId,
    locationId,
    businessCreatedAt: business.createdAt,
    periodStart,
    recordedThrough: now,
    generatedAt: now,
    horizons,
    transactions: transactions.map((transaction) => ({
      type: transaction.type.toLowerCase(),
      amount: transaction.amount.toNumber(),
      paymentStatus: transaction.paymentStatus.toLowerCase(),
      occurredAt: transaction.occurredAt,
      description: transaction.description,
      category: transaction.category,
      customerId: transaction.customerId,
      supplierId: transaction.supplierId,
      reversed: Boolean(transaction.reversalTransaction),
    })),
    debts: debts.map((debt) => ({
      type: debt.type.toLowerCase(),
      amount: debt.amount.toNumber(),
      paidAmount: debt.paidAmount.toNumber(),
      status: debt.status.toLowerCase(),
      dueAt: debt.dueAt,
      createdAt: debt.createdAt,
      customerId: debt.customerId,
      supplierId: debt.supplierId,
    })),
    accounts: accounts.map((account) => ({
      balance: account.balance.toNumber(),
    })),
  });
}

export async function saveCashflowForecastSnapshots({
  forecast,
  horizonDays,
  recalculatedFromId,
}: {
  forecast: CashflowForecastSummary;
  horizonDays?: CashflowHorizonDays;
  recalculatedFromId?: string;
}) {
  const selectedForecasts = forecast.forecasts.filter((item) =>
    horizonDays ? item.horizonDays === horizonDays : true,
  );

  if (selectedForecasts.length === 0) {
    throw new Error("Choose a valid cashflow forecast horizon.");
  }

  return getPrisma().$transaction(
    selectedForecasts.map((item) =>
      getPrisma().cashflowForecastSnapshot.create({
        data: {
          businessId: forecast.businessId,
          locationId: forecast.locationId,
          formulaVersion: cashflowForecastFormulaVersion,
          horizonDays: item.horizonDays,
          confidence: item.confidence,
          periodStart: new Date(forecast.periodStart),
          recordedThrough: new Date(forecast.recordedThrough),
          forecastStart: new Date(item.forecastStart),
          forecastEnd: new Date(item.forecastEnd),
          generatedAt: new Date(forecast.generatedAt),
          openingCash: item.openingCash,
          projectedInflows: item.projectedInflows,
          projectedOutflows: item.projectedOutflows,
          projectedNetCash: item.projectedNetCash,
          forecastEndingCash: item.forecastEndingCash,
          lowerBound: item.lowerBound,
          upperBound: item.upperBound,
          recordedMetrics: toJson(item.recordedMetrics),
          forecastSeries: toJson(item.forecastSeries),
          assumptions: toJson(item.assumptions),
          alerts: toJson(item.alerts),
          dataWarnings: toJson(item.dataWarnings),
          sourceMetrics: toJson(item.sourceMetrics),
          backtestResults: toJson(item.backtest),
          recalculatedFromId,
        },
      }),
    ),
  );
}

export function parseCashflowHorizon(value: unknown): CashflowHorizonDays | undefined {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;

  if (typeof parsed !== "number") {
    return undefined;
  }

  return cashflowForecastHorizons.find((horizon) => horizon === parsed);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}
