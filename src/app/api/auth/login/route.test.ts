import { beforeEach, describe, expect, it, vi } from "vitest";

const createSession = vi.fn();
const findUnique = vi.fn();
const getFirstBusinessForUser = vi.fn();
const verifyPassword = vi.fn();

vi.mock("@/lib/auth/rate-limit", () => ({
  enforceRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth/password", () => ({
  verifyPassword,
}));

vi.mock("@/lib/auth/session", () => ({
  createSession,
}));

vi.mock("@/lib/bookkeeping/persistence", () => ({
  getFirstBusinessForUser,
}));

vi.mock("@/lib/operations/monitoring", () => ({
  logApiFailure: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: { findUnique },
  }),
}));

function makeRequest(password: string) {
  return new Request("https://app.example.com/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://app.example.com",
      host: "app.example.com",
      "x-forwarded-proto": "https",
    },
    body: JSON.stringify({ email: "owner@example.com", password }),
  });
}

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({
      id: "user_1",
      name: "Owner",
      email: "owner@example.com",
      password: "password_hash",
      pinHash: "pin_hash",
    });
    getFirstBusinessForUser.mockResolvedValue(null);
    createSession.mockResolvedValue(undefined);
  });

  it("signs in with a matching 6-digit PIN", async () => {
    verifyPassword.mockImplementation(async (value: string, hash: string) => (
      value === "123456" && hash === "pin_hash"
    ));
    const { POST } = await import("@/app/api/auth/login/route");

    const response = await POST(makeRequest("123456"));

    expect(response.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith("user_1", expect.any(Request));
    expect(verifyPassword).toHaveBeenCalledWith("123456", "password_hash");
    expect(verifyPassword).toHaveBeenCalledWith("123456", "pin_hash");
  });

  it("rejects an incorrect password or PIN", async () => {
    verifyPassword.mockResolvedValue(false);
    const { POST } = await import("@/app/api/auth/login/route");

    const response = await POST(makeRequest("654321"));
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Email or password/PIN is not correct.");
    expect(createSession).not.toHaveBeenCalled();
  });
});
