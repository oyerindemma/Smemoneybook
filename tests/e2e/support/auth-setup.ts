import path from "node:path";

export const phase3PreviewHostname =
  "smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app";
export const verifiedPreviewOriginEnv = "SME_MONEYBOOK_E2E_VERIFIED_PREVIEW_ORIGIN";

const immutablePreviewHostname =
  /^smemoneybook-[a-z0-9]+-emmanuel-oyerindes-projects\.vercel\.app$/;
const localTestHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type AuthStateProject = "chromium" | "mobile-chrome" | "mobile-safari";

export function authStatePath(project: AuthStateProject) {
  return path.join(process.cwd(), "test-results", ".auth", `${project}.json`);
}

function hasUnexpectedUrlParts(target: URL) {
  return (
    Boolean(target.username || target.password || target.search || target.hash) ||
    (target.pathname !== "/" && target.pathname !== "")
  );
}

function isImmutablePreviewTarget(target: URL) {
  return (
    target.protocol === "https:" &&
    target.port === "" &&
    immutablePreviewHostname.test(target.hostname) &&
    !hasUnexpectedUrlParts(target)
  );
}

export function immutablePreviewOrigin(baseURL: string | undefined) {
  if (!baseURL) {
    return undefined;
  }

  try {
    const target = new URL(baseURL);
    return isImmutablePreviewTarget(target) ? target.origin : undefined;
  } catch {
    return undefined;
  }
}

export function assertSafeAuthSetupTarget(
  baseURL: string | undefined,
  verifiedPreviewOrigin: string | undefined,
) {
  if (!baseURL) {
    throw new Error("Auth setup requires an explicit Preview or local test base URL.");
  }

  let target: URL;
  try {
    target = new URL(baseURL);
  } catch {
    throw new Error("Auth setup requires a valid Preview or local test base URL.");
  }

  const isLocalTarget = localTestHostnames.has(target.hostname);
  const isPhase3Preview =
    target.protocol === "https:" &&
    target.port === "" &&
    target.hostname === phase3PreviewHostname;
  const hasUnexpectedParts = hasUnexpectedUrlParts(target);

  if (hasUnexpectedParts) {
    throw new Error(
      `Auth setup requires a root Preview or local test URL; received ${target.origin}.`,
    );
  }

  if (isLocalTarget) {
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("Local auth setup requires an HTTP or HTTPS base URL.");
    }
    return;
  }

  if (isPhase3Preview) {
    return;
  }

  if (isImmutablePreviewTarget(target)) {
    const verifiedOrigin = immutablePreviewOrigin(verifiedPreviewOrigin);
    if (!verifiedOrigin || verifiedOrigin !== target.origin) {
      throw new Error(
        `Auth setup requires verified release-gate context for immutable Preview ${target.origin}.`,
      );
    }
    return;
  }

  throw new Error(
    `Auth setup is restricted to the phase-3-staging Preview alias, a verified immutable Preview, or a local test host; received ${target.origin}.`,
  );
}
