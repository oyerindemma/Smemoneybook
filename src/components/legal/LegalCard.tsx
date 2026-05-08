import Link from "next/link";

export function LegalCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      className="block rounded-2xl border border-gray-100 bg-card p-6 shadow-sm transition-all duration-150 hover:shadow-md active:scale-[0.99]"
      href={href}
    >
      <h2 className="text-lg font-semibold tracking-tight text-textPrimary">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-textSecondary">{description}</p>
      <p className="mt-5 text-sm font-semibold text-primary">Read policy</p>
    </Link>
  );
}
