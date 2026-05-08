export { Skeleton, ListSkeleton } from "@/components/ui/Skeleton";

import { CardSkeleton, MoneyCardSkeleton } from "@/components/ui/Skeleton";

export function SummarySkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
      <MoneyCardSkeleton />
      <CardSkeleton />
    </div>
  );
}
