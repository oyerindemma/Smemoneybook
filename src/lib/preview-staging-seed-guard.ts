export const approvedPreviewStagingBranches = ["phase-2-staging", "phase-3-staging"] as const;

export const previewStagingSeedConfirmEnv = "PREVIEW_STAGING_SEED_CONFIRM";
export const legacyPhase2StagingSeedConfirmEnv = "PHASE2_STAGING_SEED_CONFIRM";

type ApprovedPreviewStagingBranch = (typeof approvedPreviewStagingBranches)[number];
type PreviewStagingSeedEnv = Record<string, string | undefined>;

type PreviewStagingSeedGuardInput = {
  branch: string;
  env?: PreviewStagingSeedEnv;
};

type PreviewStagingSeedGuardResult = {
  branch: ApprovedPreviewStagingBranch;
  confirmationEnv: typeof previewStagingSeedConfirmEnv | typeof legacyPhase2StagingSeedConfirmEnv;
  databaseHost: string;
  directHost: string;
};

const productionBranches = new Set(["main", "master", "production", "prod"]);
const productionAppUrls = new Set(["https://smemoneybook.com", "https://www.smemoneybook.com"]);
const productionTargetTokens = new Set(["production", "prod", "live"]);

export function assertPreviewStagingSeedAllowed({
  branch,
  env = process.env,
}: PreviewStagingSeedGuardInput): PreviewStagingSeedGuardResult {
  const currentBranch = branch.trim();

  if (!currentBranch) {
    throw new Error("Unable to determine the current Git branch.");
  }

  if (productionBranches.has(currentBranch)) {
    throw new Error(`Refusing to run from protected branch ${currentBranch}.`);
  }

  if (!isApprovedPreviewStagingBranch(currentBranch)) {
    throw new Error(
      `Refusing to run from ${currentBranch}. Approved Preview staging branches: ${approvedPreviewStagingBranches.join(", ")}.`,
    );
  }

  if (env.VERCEL_ENV !== "preview") {
    throw new Error("Set VERCEL_ENV=preview before running the Preview staging entitlement seed.");
  }

  if (env.VERCEL_TARGET_ENV === "production") {
    throw new Error("Refusing to run the Preview staging entitlement seed for a Production target environment.");
  }

  assertProductionDeploymentNotSelected(env);
  const confirmationEnv = assertMatchingConfirmation(currentBranch, env);
  const databaseUrl = parsePostgresUrl("DATABASE_URL", env.DATABASE_URL);
  const directUrl = parsePostgresUrl("DIRECT_URL", env.DIRECT_URL);

  assertNotProductionDatabaseTarget("DATABASE_URL", databaseUrl);
  assertNotProductionDatabaseTarget("DIRECT_URL", directUrl);

  return {
    branch: currentBranch,
    confirmationEnv,
    databaseHost: databaseUrl.hostname,
    directHost: directUrl.hostname,
  };
}

function isApprovedPreviewStagingBranch(branch: string): branch is ApprovedPreviewStagingBranch {
  return (approvedPreviewStagingBranches as readonly string[]).includes(branch);
}

function assertMatchingConfirmation(
  branch: ApprovedPreviewStagingBranch,
  env: PreviewStagingSeedEnv,
): typeof previewStagingSeedConfirmEnv | typeof legacyPhase2StagingSeedConfirmEnv {
  const genericConfirmation = env[previewStagingSeedConfirmEnv]?.trim();
  const legacyConfirmation = env[legacyPhase2StagingSeedConfirmEnv]?.trim();

  if (genericConfirmation) {
    if (genericConfirmation !== branch) {
      throw new Error(`${previewStagingSeedConfirmEnv} must exactly match the current branch (${branch}).`);
    }

    return previewStagingSeedConfirmEnv;
  }

  if (branch === "phase-2-staging" && legacyConfirmation) {
    if (legacyConfirmation !== branch) {
      throw new Error(`${legacyPhase2StagingSeedConfirmEnv} must exactly match the current branch (${branch}).`);
    }

    return legacyPhase2StagingSeedConfirmEnv;
  }

  const message =
    branch === "phase-2-staging"
      ? `Set ${previewStagingSeedConfirmEnv}=${branch} (or legacy ${legacyPhase2StagingSeedConfirmEnv}=${branch}) to confirm the Preview staging seed.`
      : `Set ${previewStagingSeedConfirmEnv}=${branch} to confirm the Preview staging seed.`;

  throw new Error(message);
}

function parsePostgresUrl(name: "DATABASE_URL" | "DIRECT_URL", value?: string) {
  const rawValue = value?.trim();

  if (!rawValue) {
    throw new Error(`${name} must be set to a Preview staging PostgreSQL database URL.`);
  }

  if (containsRedactedPlaceholder(rawValue)) {
    throw new Error(`${name} contains a redacted placeholder and cannot be used for seeding.`);
  }

  let parsed: URL;

  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(`${name} must use the postgres:// or postgresql:// protocol.`);
  }

  if (!parsed.hostname || parsed.pathname === "/" || parsed.pathname.trim() === "") {
    throw new Error(`${name} must include a database host and database name.`);
  }

  return parsed;
}

function containsRedactedPlaceholder(value: string) {
  return [
    /\[sensitive\]/i,
    /\[redacted\]/i,
    /<sensitive>/i,
    /<redacted>/i,
    /\bredacted\b/i,
    /\bplaceholder\b/i,
    /\byour[_-]?database[_-]?url\b/i,
  ].some((pattern) => pattern.test(value));
}

function assertProductionDeploymentNotSelected(env: PreviewStagingSeedEnv) {
  const appUrls = [env.NEXT_PUBLIC_APP_URL, env.NEXT_PUBLIC_SITE_URL, env.APP_URL, env.SITE_URL, env.VERCEL_URL];

  for (const value of appUrls) {
    const normalizedUrl = normalizeAppUrl(value);

    if (normalizedUrl && productionAppUrls.has(normalizedUrl)) {
      throw new Error("Refusing to run the Preview staging entitlement seed against the Production app URL.");
    }
  }
}

function normalizeAppUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  const withProtocol = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;

  return withProtocol.replace(/\/+$/, "").toLowerCase();
}

function assertNotProductionDatabaseTarget(name: "DATABASE_URL" | "DIRECT_URL", url: URL) {
  const searchIdentifiers = Array.from(url.searchParams.entries()).flatMap(([key, value]) => [key, value]);
  const targetValues = [
    url.hostname,
    decodeURIComponent(url.username),
    decodeURIComponent(url.pathname.replace(/^\/+/, "")),
    ...searchIdentifiers,
  ];

  for (const value of targetValues) {
    const tokens = tokenizeTargetIdentifier(value);

    if (tokens.some((token) => productionTargetTokens.has(token))) {
      throw new Error(`${name} appears to target a Production database.`);
    }
  }
}

function tokenizeTargetIdentifier(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
