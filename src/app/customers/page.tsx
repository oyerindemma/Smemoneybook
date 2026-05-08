import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getCustomerControlForUser } from "@/lib/bookkeeping/persistence";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export default async function CustomersPage() {
  const user = await requireUser();
  const customers = await getCustomerControlForUser(user.id);

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-textPrimary sm:px-8 sm:py-10">
      <section className="mx-auto w-full max-w-5xl">
        <Link className="text-sm font-semibold text-textSecondary" href="/">
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Customers</h1>
        <div className="mt-8 grid gap-6">
          {!customers || customers.length === 0 ? (
            <p className="rounded-2xl bg-card p-6 text-sm text-textSecondary shadow-sm border border-gray-100 transition hover:shadow-md">
              No customers yet.
            </p>
          ) : (
            customers.map((customer) => (
              <article key={customer.id} className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{customer.name}</h2>
                    <p className="text-sm text-textSecondary">{customer.phone ?? "No phone"}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-textMuted">Open debt</p>
                    <strong>{formatNaira(customer.openDebtTotal)}</strong>
                    {customer.overdueCount > 0 ? (
                      <p className="text-xs font-semibold text-danger">
                        {customer.overdueCount} overdue
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
