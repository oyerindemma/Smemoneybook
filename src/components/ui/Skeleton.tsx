export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-textMuted/20 ${className}`} />;
}

export function MoneyCardSkeleton() {
  return (
    <section className="rounded-3xl bg-primary p-6 shadow-xl md:p-8">
      <Skeleton className="h-4 w-36 bg-white/20" />
      <Skeleton className="mt-5 h-12 w-3/4 bg-white/20 md:h-16" />
      <div className="mt-8 grid gap-3 rounded-2xl bg-white/10 p-4 sm:grid-cols-2">
        <Skeleton className="h-16 bg-white/20" />
        <Skeleton className="h-16 bg-white/20" />
      </div>
    </section>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-2xl bg-background p-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-3 h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm md:p-7">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-6 w-48" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </section>
  );
}
