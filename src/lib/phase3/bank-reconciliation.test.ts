import { describe, expect, it } from "vitest";
import {
  parseBankStatementCsv,
  suggestBankReconciliationMatches,
} from "@/lib/phase3/bank-reconciliation";

describe("bank reconciliation parser and matcher", () => {
  it("normalizes CSV rows, detects duplicates, and suggests categories", () => {
    const parsed = parseBankStatementCsv(`Date,Narration,Debit,Credit,Reference,Balance
19/07/2026,POS settlement from Ada,,15000,REF-1,20000
19/07/2026,POS settlement from Ada,,15000,REF-1,35000
20/07/2026,Supplier payment,5000,,REF-2,30000`);

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].direction).toBe("inflow");
    expect(parsed.rows[1].duplicateOfRowNumber).toBe(2);
    expect(parsed.duplicateRowCount).toBe(1);
    expect(parsed.rows[2].suggestedCategory).toBe("Supplier payment");
  });

  it("returns clear header validation errors", () => {
    const parsed = parseBankStatementCsv(`When,Details
2026-07-19,No amount`);

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors.map((error) => error.message)).toContain(
      "CSV must include a date column.",
    );
    expect(parsed.errors.map((error) => error.message)).toContain(
      "CSV must include either an amount column or debit/credit columns.",
    );
  });

  it("suggests transaction matches and flags missing records", () => {
    const parsed = parseBankStatementCsv(`Date,Description,Amount
2026-07-19,Ada payment,15000
2026-07-20,Unknown bank charge,-2000`);
    const suggestions = suggestBankReconciliationMatches({
      rows: parsed.rows,
      transactions: [
        {
          id: "txn_1",
          type: "sale",
          amount: 15000,
          paymentStatus: "paid",
          occurredAt: new Date("2026-07-19T10:00:00.000Z"),
          description: "Ada payment",
          customerName: "Ada",
        },
        {
          id: "txn_reversed",
          type: "expense",
          amount: 2000,
          paymentStatus: "paid",
          occurredAt: new Date("2026-07-20T10:00:00.000Z"),
          description: "Bank charge",
          reversed: true,
        },
      ],
    });

    expect(suggestions[0].transactionId).toBe("txn_1");
    expect(suggestions[0].matchType).toBe("exact");
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(85);
    expect(suggestions[1].matchType).toBe("missing_record");
  });
});
