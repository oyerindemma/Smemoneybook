import { ListSkeleton, SummarySkeleton } from "@/components/dashboard/Skeleton";

export default function Loading() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background pb-24 text-textPrimary">
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-x-6 gap-y-10 p-5 md:grid-cols-2 md:p-8 lg:grid-cols-3">
        <div className="md:col-span-2">
          <SummarySkeleton />
        </div>
        <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7">
          <ListSkeleton rows={3} />
        </section>
        <section className="rounded-2xl bg-card p-6 shadow-sm border border-gray-100 transition hover:shadow-md sm:p-7 md:col-span-2">
          <ListSkeleton rows={4} />
        </section>
      </section>
    </main>
  );
}
