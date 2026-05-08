import { CircleDollarSign, type LucideIcon } from "lucide-react";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon: Icon = CircleDollarSign,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl bg-background px-5 py-10 text-center text-textSecondary">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-card text-primary shadow-sm">
        <Icon size={22} aria-hidden="true" />
      </div>
      <p className="text-lg font-semibold text-textPrimary">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 md:text-base">{description}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-5 min-h-11 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primaryHover hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
