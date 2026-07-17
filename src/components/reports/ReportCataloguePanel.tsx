"use client";

import { reportDefinitions } from "@/lib/reports/definitions";

export function ReportCataloguePanel() {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-textSecondary">Reports</p>
          <h2 className="mt-1 text-base font-semibold text-textPrimary">Advanced reports</h2>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {reportDefinitions.length}
        </span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {reportDefinitions.map((report) => (
          <div key={report.id} className="rounded-xl bg-background p-4">
            <p className="text-sm font-semibold text-textPrimary">{report.name}</p>
            <p className="mt-1 text-xs leading-5 text-textSecondary">
              {report.dimensions.slice(0, 4).join(" · ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
