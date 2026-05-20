"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export function UniversalSearch() {
  const { state } = useDashboard();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return [];
    }

    return [
      ...state.debts
        .filter((debt) => debt.partyName.toLowerCase().includes(term))
        .map((debt) => ({
          id: `customer-${debt.id}`,
          href: "/people",
          title: debt.partyName,
          helper: `Customer - ${formatNaira(debt.remainingAmount)} owed`,
        })),
      ...state.items
        .filter((item) => item.name.toLowerCase().includes(term))
        .map((item) => ({
          id: `product-${item.id}`,
          href: "/stock",
          title: item.name,
          helper: `Product - ${item.quantityOnHand} left`,
        })),
      ...state.transactions
        .filter(
          (transaction) =>
            transaction.description.toLowerCase().includes(term) ||
            transaction.partyName?.toLowerCase().includes(term) ||
            transaction.amount.toString().includes(term),
        )
        .map((transaction) => ({
          id: `transaction-${transaction.id}`,
          href: "/money",
          title: transaction.description,
          helper: `${transaction.type} - ${formatNaira(transaction.amount)}`,
        })),
    ].slice(0, 6);
  }, [query, state]);

  return (
    <div className="relative mb-6">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted"
          size={18}
          aria-hidden="true"
        />
        <input
          className="min-h-14 w-full rounded-2xl border border-gray-100 bg-card pl-12 pr-12 text-base font-medium text-textPrimary shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          type="search"
          placeholder="Search customers, invoices, products"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query ? (
          <button
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-textMuted hover:bg-background"
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </label>

      {query ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 rounded-2xl border border-gray-100 bg-card p-3 shadow-xl">
          {results.length === 0 ? (
            <p className="rounded-xl bg-background p-4 text-sm text-textSecondary">No result found.</p>
          ) : (
            <div className="grid gap-2">
              {results.map((result) => (
                <Link
                  key={result.id}
                  className="rounded-xl bg-background p-4 transition hover:shadow-sm"
                  href={result.href}
                  onClick={() => setQuery("")}
                >
                  <span className="block text-sm font-semibold text-textPrimary">{result.title}</span>
                  <span className="mt-1 block text-xs text-textSecondary">{result.helper}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
