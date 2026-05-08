import { describe, expect, it } from "vitest";
import { normalizeNigerianPhoneNumber } from "@/lib/whatsapp/formatter";

describe("WhatsApp phone formatter", () => {
  it("normalizes Nigerian local numbers", () => {
    expect(normalizeNigerianPhoneNumber("08012345678")).toBe("2348012345678");
  });

  it("keeps valid 234 and +234 numbers", () => {
    expect(normalizeNigerianPhoneNumber("+234 801 234 5678")).toBe("2348012345678");
    expect(normalizeNigerianPhoneNumber("2348012345678")).toBe("2348012345678");
  });

  it("rejects invalid formats", () => {
    expect(() => normalizeNigerianPhoneNumber("12345")).toThrow("Invalid Nigerian");
  });
});
