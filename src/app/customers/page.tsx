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
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <Insight label="Total Bought" value={formatNaira(customer.totalBought)} />
                  <Insight label="Outstanding Debt" value={formatNaira(customer.openDebtTotal)} />
                  <Insight
                    label="Last Purchase"
                    value={customer.lastPurchase ? formatDate(customer.lastPurchase) : "None yet"}
                  />
                  <Insight label="Most Bought Product" value={customer.mostBoughtProduct ?? "Not enough sales"} />
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-background p-4">
      <p className="text-xs font-medium text-textSecondary">{label}</p>
      <strong className="mt-2 block text-sm text-textPrimary">{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
