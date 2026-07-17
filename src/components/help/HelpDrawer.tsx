"use client";

import { useMemo, useState } from "react";
import { HelpCircle, Search, X } from "lucide-react";
import { usePathname } from "next/navigation";

const articles = [
  {
    title: "Add sale",
    module: "Money",
    body: "Use Record or POS, choose products if needed, enter amount paid, then save.",
  },
  {
    title: "Add expense",
    module: "Money",
    body: "Choose Expense, enter amount, category, money location, and save.",
  },
  {
    title: "Customer debt",
    module: "People",
    body: "Turn off paid now or leave a POS balance. MoneyBook keeps the customer owing list.",
  },
  {
    title: "Send invoice",
    module: "Money",
    body: "Open Record, choose invoice mode from Stock or Record, add products, then share by WhatsApp.",
  },
  {
    title: "Confirm payment",
    module: "People",
    body: "Open People, choose the customer owing, and record money received.",
  },
  {
    title: "Add product",
    module: "Stock",
    body: "Open Stock, add product name, price, optional barcode, unit, category, and brand.",
  },
  {
    title: "Stock in",
    module: "Stock",
    body: "Use Adjust stock, choose Stock in, enter quantity and reason, then save.",
  },
  {
    title: "Stock out",
    module: "Stock",
    body: "Use Adjust stock, choose Stock out, enter quantity and a reason for sensitive removals.",
  },
  {
    title: "Reports",
    module: "Reports",
    body: "Open Reports to review sales, expenses, profit, tax summary, and saved snapshots.",
  },
];

export function HelpDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeModule = getModuleFromPath(pathname);
  const filteredArticles = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    const scoped = cleanQuery
      ? articles
      : articles.filter((article) => article.module === activeModule).concat(articles.slice(0, 3));

    return scoped.filter((article, index, list) => {
      const isUnique = list.findIndex((candidate) => candidate.title === article.title) === index;
      const matches =
        !cleanQuery ||
        `${article.title} ${article.module} ${article.body}`.toLowerCase().includes(cleanQuery);
      return isUnique && matches;
    });
  }, [activeModule, query]);

  return (
    <>
      <button
        aria-label="Open help"
        className="fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-card text-textSecondary shadow-sm md:right-6 md:top-6"
        type="button"
        onClick={() => setOpen(true)}
      >
        <HelpCircle size={19} aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-textPrimary/35 p-0 md:p-6">
          <button
            aria-label="Close help"
            className="absolute inset-0 cursor-default"
            type="button"
            onClick={() => setOpen(false)}
          />
          <aside
            aria-label="Help"
            className="absolute bottom-0 right-0 top-auto max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl md:bottom-6 md:right-6 md:top-6 md:max-w-md md:rounded-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-textSecondary">{activeModule} help</p>
                <h2 className="text-xl font-semibold">What is this?</h2>
              </div>
              <button
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <label className="relative mt-5 block">
              <Search
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-textMuted"
                size={18}
                aria-hidden="true"
              />
              <input
                className="h-12 w-full rounded-xl border border-gray-200 pl-11 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Search help"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <div className="mt-5 grid gap-3">
              {filteredArticles.map((article) => (
                <article className="rounded-xl border border-gray-100 bg-background p-4" key={article.title}>
                  <p className="text-xs font-semibold text-primary">{article.module}</p>
                  <h3 className="mt-1 font-semibold">{article.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-textSecondary">{article.body}</p>
                </article>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function getModuleFromPath(pathname: string) {
  if (pathname.startsWith("/stock")) {
    return "Stock";
  }

  if (pathname.startsWith("/people")) {
    return "People";
  }

  if (pathname.startsWith("/reports")) {
    return "Reports";
  }

  return "Money";
}
