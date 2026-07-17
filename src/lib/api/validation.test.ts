import { describe, expect, it, vi } from "vitest";
import {
  customerReturnRequestSchema,
  inventoryItemRequestSchema,
  inventoryMovementRequestSchema,
  loginRequestSchema,
  passwordResetConfirmSchema,
  parseJsonBody,
  posCheckoutRequestSchema,
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
    expect((body as RequestValidationError).message).toBe("Enter your password or PIN.");
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
      password: "12345678",
      pin: "123456",
      businessName: null,
    }), registerRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).toBe("Enter a valid email.");
  });

  it("requires a 6-digit PIN when registering", async () => {
    const result = await parseJsonBody(jsonRequest({
      name: "EOO",
      email: "owner@example.com",
      password: "12345678",
      pin: "12345",
    }), registerRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).toBe("Enter a 6-digit PIN.");
  });

  it("requires a 6-digit PIN when confirming password reset", async () => {
    const result = await parseJsonBody(jsonRequest({
      token: "reset-token",
      password: "12345678",
      pin: "abcdef",
    }), passwordResetConfirmSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).toBe("Enter a 6-digit PIN.");
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

  it("accepts decimal product quantities and product metadata", async () => {
    const result = await parseJsonBody(jsonRequest({
      businessId: "business_1",
      name: "Groundnut oil",
      barcode: "1234567890123",
      unitName: "litre",
      categoryName: "Cooking oil",
      brandName: "Mama Gold",
      sellingPrice: 2500,
      costPrice: 2100,
      quantityOnHand: 2.5,
      lowStockLevel: 1.5,
    }), inventoryItemRequestSchema);

    expect(result.quantityOnHand).toBe(2.5);
    expect(result.unitName).toBe("litre");
    expect(result.barcode).toBe("1234567890123");
  });

  it("requires positive product unit conversion factors", async () => {
    const result = await parseJsonBody(jsonRequest({
      businessId: "business_1",
      name: "Soft drink carton",
      sellingPrice: 8000,
      costPrice: 6500,
      quantityOnHand: 4,
      lowStockLevel: 1,
      baseUnitId: "piece",
      sellingUnitId: "carton",
      conversionFactor: 0,
    }), inventoryItemRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
  });

  it("requires a reason for sensitive stock reductions", async () => {
    const result = await parseJsonBody(jsonRequest({
      businessId: "business_1",
      quantity: 2,
      adjustmentType: "theft",
    }), inventoryMovementRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).toBe("Enter a reason for this stock reduction.");
  });

  it("rejects split payments that exceed the sale amount", async () => {
    const result = await parseJsonBody(jsonRequest({
      businessId: "business_1",
      type: "sale",
      amount: 1000,
      accountId: "cash",
      description: "Sale",
      paymentStatus: "paid",
      paymentAllocations: [
        { method: "cash", amount: 800, accountId: "cash" },
        { method: "bank_transfer", amount: 400, accountId: "bank" },
      ],
    }), transactionRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).toBe("Payment amounts cannot be more than the sale total.");
  });

  it("accepts POS checkout with split payments and customer balance", async () => {
    const result = await parseJsonBody(jsonRequest({
      businessId: "business_1",
      idempotencyKey: "pos_1",
      items: [{ inventoryItemId: "item_1", quantity: 2 }],
      payments: [
        { method: "cash", amount: 5000, accountId: "cash" },
        { method: "pos_terminal", amount: 3000, accountId: "pos" },
      ],
      orderDiscount: 0,
      customerName: "Amina Stores",
    }), posCheckoutRequestSchema);

    expect(result.payments).toHaveLength(2);
    expect(result.customerName).toBe("Amina Stores");
  });

  it("rejects customer returns without returned items", async () => {
    const result = await parseJsonBody(jsonRequest({
      businessId: "business_1",
      idempotencyKey: "return_1",
      originalTransactionId: "txn_1",
      reason: "Wrong item",
      disposition: "sellable_stock",
      outcome: "cash_refund",
      items: [],
    }), customerReturnRequestSchema).catch((error) => error);

    expect(result).toBeInstanceOf(RequestValidationError);
    expect((result as RequestValidationError).message).toBe("Select at least one returned item.");
  });
});
