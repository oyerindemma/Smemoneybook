import { describe, expect, it } from "vitest";
import { getPhase3NavigationStatus } from "@/lib/phase3/navigation-status";

describe("Phase 3 navigation status labels", () => {
  it("marks implemented modules disabled by flag as unavailable", () => {
    expect(getPhase3NavigationStatus("loanReadiness", false)).toBe("Unavailable");
  });

  it("marks partial modules as coming soon while disabled", () => {
    expect(getPhase3NavigationStatus("payroll", false)).toBe("Coming soon");
  });

  it("marks enabled implemented modules as operational Preview", () => {
    expect(getPhase3NavigationStatus("predictiveAlerts", true)).toBe("Preview — operational");
  });

  it("marks enabled partial modules as limited Preview", () => {
    expect(getPhase3NavigationStatus("bankReconciliation", true)).toBe("Preview — limited");
  });

  it("marks implemented staff performance as unavailable while disabled", () => {
    expect(getPhase3NavigationStatus("staffPerformance", false)).toBe("Unavailable");
  });

  it("marks externally dependent modules as setup required while disabled", () => {
    expect(getPhase3NavigationStatus("whatsappAutomation", false)).toBe("Setup required");
  });
});
