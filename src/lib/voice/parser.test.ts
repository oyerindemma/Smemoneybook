import { describe, expect, it } from "vitest";
import { createVoiceBookkeepingDraft } from "@/lib/voice/parser";

describe("createVoiceBookkeepingDraft", () => {
  it("parses spoken sale entries", () => {
    const draft = createVoiceBookkeepingDraft("Sold rice for 5000 cash");

    expect(draft.intent.kind).toBe("sale");
    expect(draft.capture?.amount).toBe(5000);
    expect(draft.capture?.paymentStatus).toBe("paid");
  });

  it("parses spoken expense entries", () => {
    const draft = createVoiceBookkeepingDraft("Spent naira 3000 on fuel by POS");

    expect(draft.intent.kind).toBe("expense");
    expect(draft.capture?.amount).toBe(3000);
    expect(draft.intent.kind === "expense" ? draft.intent.paymentMethod : undefined).toBe("pos");
  });
});
