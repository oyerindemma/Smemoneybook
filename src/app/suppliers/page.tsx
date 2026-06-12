import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getSupplierControlForUser } from "@/lib/bookkeeping/persistence";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export default async function SuppliersPage() {
  const user = await requireUser();
  const suppliers = await getSupplierControlForUser(user.id);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-textPrimary sm:px-8 sm:py-10">
      <section className="mx-auto w-full max-w-5xl">
        <Link className="text-sm font-semibold text-textSecondary" href="/money">
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Suppliers</h1>
        <div className="mt-8 grid gap-6">
          {!suppliers || suppliers.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-sm text-textSecondary shadow-sm border border-gray-100 transition hover:shadow-md">
              No suppliers yet.
            </p>
          ) : (
            suppliers.map((supplier) => (
              <article key={supplier.id} className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{supplier.name}</h2>
                    <p className="text-sm text-textSecondary">{supplier.phone ?? "No phone"}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-textMuted">Open bill</p>
                    <strong>{formatNaira(supplier.openDebtTotal)}</strong>
                    {supplier.overdueCount > 0 ? (
                      <p className="text-xs font-semibold text-danger">
                        {supplier.overdueCount} overdue
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
