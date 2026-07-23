import { createHash } from "node:crypto";
import type { BankStatementDirection } from "@/lib/bank-reconciliation/definitions";

export function normalizeHeader(value: string) {
  return normalizeText(value).replaceAll("_", " ");
}

export function normalizeDescription(value: string) {
  return normalizeText(value).slice(0, 500);
}

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function parseMoney(value: string | undefined, allowSigned = false) {
  if (!value?.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  const negativeByParentheses = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (allowSigned) {
    return negativeByParentheses ? -Math.abs(parsed) : parsed;
  }

  return Math.abs(parsed);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function parseFlexibleDate(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }

  const dayFirstMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (dayFirstMatch) {
    const first = Number(dayFirstMatch[1]);
    const second = Number(dayFirstMatch[2]);
    const year = normalizeYear(Number(dayFirstMatch[3]));
    const day = first > 12 || second <= 12 ? first : second;
    const month = first > 12 || second <= 12 ? second : first;
    return new Date(Date.UTC(year, month - 1, day));
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function buildBankStatementFileHash(csv: string) {
  return createHash("sha256").update(csv.trim()).digest("hex");
}

export function buildBankStatementRowFingerprint(input: {
  postedAt: Date;
  amount: number;
  direction: BankStatementDirection;
  description: string;
  reference?: string;
  externalReference?: string;
}) {
  const source = [
    input.postedAt.toISOString().slice(0, 10),
    roundMoney(input.amount).toFixed(2),
    input.direction,
    normalizeDescription(input.description).slice(0, 160),
    normalizeText(input.reference ?? ""),
    normalizeText(input.externalReference ?? ""),
  ].join("|");

  return createHash("sha256").update(source).digest("hex");
}

export function daysBetween(left: Date, right: Date) {
  const leftDay = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate());
  const rightDay = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate());
  return Math.round((leftDay - rightDay) / 86_400_000);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}
