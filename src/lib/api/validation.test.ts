import { describe, expect, it, vi } from "vitest";
import {
  loginRequestSchema,
  parseJsonBody,
  registerRequestSchema,
  RequestValidationError,
  transactionRequestSchema,
} from "@/lib/api/validation";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("parseJsonBody", () => {
  it("sanitizes nullish strings before validating", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const body = await parseJsonBody(jsonRequest({
      email: "owner@example.com",
      password: null,
    }), loginRequestSchema).catch((error) => error);

    expect(body).toBeInstanceOf(RequestValidationError);
    expect((body as RequestValidationError).message).toBe("Enter your password.");
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it("does not expose raw Zod errors to users", async () => {
    const result = await parseJsonBody(jsonRequest({
      name: null,
      email: null,
      password: null,
    }), registerRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).not.toMatch(/invalid_type|Zod/i);
  });

  it("handles null email values with a friendly validation message", async () => {
    const result = await parseJsonBody(jsonRequest({
      name: "EOO",
      email: null,
      password: "123456789012",
      businessName: null,
    }), registerRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).toBe("Enter a valid email.");
  });

  it("accepts optional null string fields as empty optional values", async () => {
    const result = await parseJsonBody(jsonRequest({
      businessId: "business_1",
      type: "sale",
      amount: 1000,
      accountId: "account_1",
      destinationAccountId: null,
      description: null,
      category: null,
      paymentStatus: "paid",
      partyName: null,
      partyPhone: null,
    }), transactionRequestSchema);

    expect(result.description).toBe("Activity");
    expect(result.category).toBe("");
    expect(result.partyName).toBe("");
  });
});
