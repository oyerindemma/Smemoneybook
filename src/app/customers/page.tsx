import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getCustomerControlForUser } from "@/lib/bookkeeping/persistence";
import { formatNaira } from "@/lib/bookkeeping/transaction-engine";

export default async function CustomersPage() {
  const user = await requireUser();
  const customers = await getCustomerControlForUser(user.id);

  return (
    <main className="min-h-screen bg-[#F5F3EF] px-4 py-6 text-ink">
      <section className="mx-auto w-full max-w-5xl">
        <Link className="text-sm font-semibold text-black/55" href="/">
          Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Customers</h1>
        <div className="mt-4 grid gap-3">
          {!customers || customers.length === 0 ? (
            <p className="rounded-xl bg-white p-4 text-sm text-black/60 shadow-soft">
              No customers yet.
            </p>
          ) : (
            customers.map((customer) => (
              <article key={customer.id} className="rounded-xl bg-white p-4 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{customer.name}</h2>
                    <p className="text-sm text-black/55">{customer.phone ?? "No phone"}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-black/50">Open debt</p>
                    <strong>{formatNaira(customer.openDebtTotal)}</strong>
                    {customer.overdueCount > 0 ? (
                      <p className="text-xs font-semibold text-red-600">
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
