"use client";

import { MessageCircle, Share2, Trophy } from "lucide-react";
import type { MoneybookState } from "@/lib/bookkeeping/transaction-engine";
import {
  buildReferralShareText,
  buildViralMomentShareText,
  getReferralCode,
  getReferralLink,
  getReferralRewards,
  getWhatsAppShareUrl,
} from "@/lib/viral/referral-engine";
import { trackProductEvent } from "@/lib/analytics/product-analytics";

export function ViralGrowthPanel({ state }: { state: MoneybookState }) {
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const referralLink = getReferralLink({
    origin,
    businessId: state.businessId,
    businessName: state.businessName,
  });
  const referralCode = getReferralCode({
    businessId: state.businessId,
    businessName: state.businessName,
  });
  const rewards = getReferralRewards();
  const referralText = buildReferralShareText({
    businessName: state.businessName,
    referralLink,
  });
  const momentText = buildViralMomentShareText(state, referralLink);

  function share(kind: "referral" | "moment") {
    const message = kind === "referral" ? referralText : momentText;
    trackProductEvent("viral_share_clicked", {
      kind,
      channel: "whatsapp",
      referral_code: referralCode,
    });
    window.open(getWhatsAppShareUrl(message), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-card p-4 shadow-sm md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
          <Share2 size={18} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium text-textSecondary">Grow with friends</p>
          <h2 className="text-lg font-semibold leading-6 text-textPrimary">
            Invite another business owner and unlock more value.
          </h2>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-background p-3">
        <p className="text-xs font-semibold text-textMuted">Your referral code</p>
        <p className="mt-1 break-all text-base font-bold text-textPrimary">{referralCode}</p>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-textSecondary">
        <p> You get: {rewards.referrer.slice(0, 2).join(" + ")}.</p>
        <p> New user gets: {rewards.newUser.slice(0, 2).join(" + ")}.</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm"
          type="button"
          onClick={() => share("referral")}
        >
          <MessageCircle size={16} aria-hidden="true" />
          Share on WhatsApp
        </button>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-textPrimary"
          type="button"
          onClick={() => share("moment")}
        >
          <Trophy size={16} aria-hidden="true" />
          Share win
        </button>
      </div>

      <p className="mt-4 text-xs leading-5 text-textMuted">
        Accountant partners and community champions can use this link to onboard multiple businesses.
      </p>
    </section>
  );
}
