import { describe, expect, it } from "vitest";
import { getPhase3NavigationStatus } from "@/lib/phase3/navigation-status";

describe("Phase 3 navigation status labels", () => {
  it("marks implemented modules disabled by flag as unavailable", () => {
    expect(getPhase3NavigationStatus("loanReadiness", false)).toBe("Unavailable");
  });

  it("marks implemented payroll as unavailable while disabled", () => {
    expect(getPhase3NavigationStatus("payroll", false)).toBe("Unavailable");
  });

  it("marks enabled implemented modules as operational Preview", () => {
    expect(getPhase3NavigationStatus("predictiveAlerts", true)).toBe("Preview — operational");
  });

  it("marks enabled payroll as operational Preview", () => {
    expect(getPhase3NavigationStatus("payroll", true)).toBe("Preview — operational");
  });

  it("marks implemented staff performance as unavailable while disabled", () => {
    expect(getPhase3NavigationStatus("staffPerformance", false)).toBe("Unavailable");
  });

  it("marks externally dependent modules as setup required while disabled", () => {
    expect(getPhase3NavigationStatus("whatsappAutomation", false)).toBe("Setup required");
  });
});
