import { describe, expect, it } from "vitest";
import {
  assertPreviewStagingSeedAllowed,
  legacyPhase2StagingSeedConfirmEnv,
  previewStagingSeedConfirmEnv,
} from "@/lib/preview-staging-seed-guard";

const validDatabaseUrl = "postgresql://seed_user:secret@ep-preview-staging.neon.tech/smemoneybook_staging";
const validDirectUrl = "postgres://seed_user:secret@ep-direct-staging.neon.tech/smemoneybook_staging";

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    VERCEL_ENV: "preview",
    DATABASE_URL: validDatabaseUrl,
    DIRECT_URL: validDirectUrl,
    [previewStagingSeedConfirmEnv]: "phase-3-staging",
    ...overrides,
  };
}

describe("Preview staging seed guard", () => {
  it("allows phase-2-staging Preview with matching generic confirmation", () => {
    expect(
      assertPreviewStagingSeedAllowed({
        branch: "phase-2-staging",
        env: env({ [previewStagingSeedConfirmEnv]: "phase-2-staging" }),
      }),
    ).toMatchObject({
      branch: "phase-2-staging",
      confirmationEnv: previewStagingSeedConfirmEnv,
    });
  });

  it("allows phase-2-staging Preview with matching legacy confirmation", () => {
    expect(
      assertPreviewStagingSeedAllowed({
        branch: "phase-2-staging",
        env: env({
          [previewStagingSeedConfirmEnv]: undefined,
          [legacyPhase2StagingSeedConfirmEnv]: "phase-2-staging",
        }),
      }),
    ).toMatchObject({
      branch: "phase-2-staging",
      confirmationEnv: legacyPhase2StagingSeedConfirmEnv,
    });
  });

  it("allows phase-3-staging Preview with matching generic confirmation", () => {
    expect(
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env(),
      }),
    ).toMatchObject({
      branch: "phase-3-staging",
      confirmationEnv: previewStagingSeedConfirmEnv,
    });
  });

  it("rejects main", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "main",
        env: env({ [previewStagingSeedConfirmEnv]: "main" }),
      }),
    ).toThrow("protected branch main");
  });

  it("rejects production", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "production",
        env: env({ [previewStagingSeedConfirmEnv]: "production" }),
      }),
    ).toThrow("protected branch production");
  });

  it("rejects VERCEL_ENV=production", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ VERCEL_ENV: "production" }),
      }),
    ).toThrow("VERCEL_ENV=preview");
  });

  it("rejects missing confirmation", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ [previewStagingSeedConfirmEnv]: undefined }),
      }),
    ).toThrow("PREVIEW_STAGING_SEED_CONFIRM=phase-3-staging");
  });

  it("rejects mismatched confirmation", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ [previewStagingSeedConfirmEnv]: "phase-2-staging" }),
      }),
    ).toThrow("must exactly match the current branch");
  });

  it("rejects invalid DATABASE_URL", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ DATABASE_URL: "not-a-url" }),
      }),
    ).toThrow("DATABASE_URL must be a valid PostgreSQL URL");
  });

  it("rejects redacted DATABASE_URL", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ DATABASE_URL: "[SENSITIVE]" }),
      }),
    ).toThrow("DATABASE_URL contains a redacted placeholder");
  });

  it("rejects invalid DIRECT_URL", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ DIRECT_URL: "mysql://seed_user:secret@example.com/smemoneybook_staging" }),
      }),
    ).toThrow("DIRECT_URL must use the postgres:// or postgresql:// protocol");
  });

  it("rejects Production-looking database targets", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ DATABASE_URL: "postgresql://seed_user:secret@prod-db.example.com/smemoneybook" }),
      }),
    ).toThrow("DATABASE_URL appears to target a Production database");
  });

  it("rejects Production app URLs", () => {
    expect(() =>
      assertPreviewStagingSeedAllowed({
        branch: "phase-3-staging",
        env: env({ NEXT_PUBLIC_APP_URL: "https://smemoneybook.com" }),
      }),
    ).toThrow("Production app URL");
  });
});
