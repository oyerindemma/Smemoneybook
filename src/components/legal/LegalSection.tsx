export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-6 shadow-sm md:p-7">
      <h2 className="text-xl font-semibold tracking-tight text-textPrimary">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-7 text-textSecondary md:text-base">
        {children}
      </div>
    </section>
  );
}
