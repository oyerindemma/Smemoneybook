import type { CaptureFormData } from "@/components/dashboard/types";

export type VoiceBookkeepingIntent =
  | {
      kind: "sale";
      rawText: string;
      amount?: number;
      productName?: string;
      paymentMethod?: "cash" | "bank" | "pos" | "mobile_money";
    }
  | {
      kind: "expense";
      rawText: string;
      amount?: number;
      note?: string;
      paymentMethod?: "cash" | "bank" | "pos" | "mobile_money";
    }
  | {
      kind: "unknown";
      rawText: string;
    };

export type VoiceBookkeepingDraft = {
  intent: VoiceBookkeepingIntent;
  capture?: Partial<CaptureFormData>;
  needsReview: boolean;
};
