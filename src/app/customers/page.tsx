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
        <Link className="text-sm font-semibold text-textSecondary" href="/money">
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

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <section>
                    <h3 className="text-sm font-semibold text-textPrimary">Recent purchases</h3>
                    <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-background">
                      {customer.purchaseHistory.length === 0 ? (
                        <p className="p-4 text-sm text-textSecondary">No purchases yet.</p>
                      ) : (
                        customer.purchaseHistory.slice(0, 4).map((purchase) => (
                          <div key={purchase.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-textPrimary">
                                  {purchase.description}
                                </p>
                                <p className="mt-1 text-xs text-textSecondary">
                                  {formatDate(purchase.occurredAt)} · {purchase.paymentStatus}
                                </p>
                              </div>
                              <strong className="text-sm text-textPrimary">
                                {formatNaira(purchase.total)}
                              </strong>
                            </div>
                            {purchase.items.length > 0 ? (
                              <div className="mt-3 grid gap-1">
                                {purchase.items.map((item, index) => (
                                  <p
                                    key={`${purchase.id}-${item.inventoryItemId}-${index}`}
                                    className="text-xs text-textSecondary"
                                  >
                                    {item.name} · {formatQuantity(item.quantity, item.unitLabel)} ·{" "}
                                    {formatNaira(item.unitPrice)}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold text-textPrimary">Pricing history</h3>
                    <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100 bg-background">
                      {customer.pricingHistory.length === 0 ? (
                        <p className="p-4 text-sm text-textSecondary">No product prices yet.</p>
                      ) : (
                        customer.pricingHistory.slice(0, 5).map((price) => (
                          <div key={price.inventoryItemId || price.productName} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-textPrimary">
                                  {price.productName}
                                </p>
                                <p className="mt-1 text-xs text-textSecondary">
                                  {formatQuantity(price.quantity)} across {price.purchases} purchase
                                  {price.purchases === 1 ? "" : "s"}
                                </p>
                              </div>
                              <strong className="text-sm text-textPrimary">
                                {formatNaira(price.lastUnitPrice)}
                              </strong>
                            </div>
                            <p className="mt-2 text-xs text-textSecondary">
                              Range {formatNaira(price.lowestUnitPrice)} -{" "}
                              {formatNaira(price.highestUnitPrice)} · Last {formatDate(price.lastPurchasedAt)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
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

function formatQuantity(value: number, unitLabel?: string) {
  const quantity = new Intl.NumberFormat("en-NG", {
    maximumFractionDigits: 2,
  }).format(value);

  return unitLabel ? `${quantity} ${unitLabel}` : quantity;
}
