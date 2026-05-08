import { describe, expect, it } from "vitest";
import { detectWhatsAppIntent } from "@/lib/chatbot/whatsapp-intents";

describe("WhatsApp chatbot intents", () => {
  it("routes supported commands", () => {
    expect(detectWhatsAppIntent("today")).toBe("today");
    expect(detectWhatsAppIntent("sales today")).toBe("today");
    expect(detectWhatsAppIntent("who owes me")).toBe("debt_summary");
    expect(detectWhatsAppIntent("low stock")).toBe("low_stock");
    expect(detectWhatsAppIntent("summary")).toBe("summary");
  });

  it("does not treat unsupported text as a mutation", () => {
    expect(detectWhatsAppIntent("record 5000 sale")).toBe("unknown");
  });
});
