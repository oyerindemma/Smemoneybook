import Link from "next/link";

export default function PaymentFailedPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-textPrimary">
      <section className="mx-auto max-w-md rounded-2xl border border-gray-100 bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-textSecondary">SME Moneybook billing</p>
        <h1 className="mt-2 text-2xl font-semibold">Payment failed</h1>
        <p className="mt-3 text-sm leading-6 text-textSecondary">
          We could not complete this payment. You can retry safely. Your plan will only activate after Paystack confirms payment.
        </p>
        <div className="mt-6 grid gap-3">
          <Link
            className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white transition-all duration-150 hover:bg-primaryHover active:scale-[0.98]"
            href="/more"
          >
            Retry payment
          </Link>
          <a
            className="flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-textPrimary transition-all duration-150 hover:bg-background active:scale-[0.98]"
            href="mailto:support@smemoneybook.com"
          >
            Contact support
          </a>
        </div>
      </section>
    </main>
  );
}
