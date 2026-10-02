import path from "node:path";

const phase3PreviewHostname =
  "smemoneybook-git-phase-3-staging-emmanuel-oyerindes-projects.vercel.app";
const localTestHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

export type AuthStateProject = "chromium" | "mobile-chrome" | "mobile-safari";

export function authStatePath(project: AuthStateProject) {
  return path.join(process.cwd(), "test-results", ".auth", `${project}.json`);
}

export function assertSafeAuthSetupTarget(baseURL: string | undefined) {
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
    target.protocol === "https:" && target.hostname === phase3PreviewHostname;
  const hasUnexpectedUrlParts =
    Boolean(target.username || target.password || target.search || target.hash) ||
    (target.pathname !== "/" && target.pathname !== "");

  if ((!isLocalTarget && !isPhase3Preview) || hasUnexpectedUrlParts) {
    throw new Error(
      `Auth setup is restricted to the phase-3-staging Preview alias or a local test host; received ${target.origin}.`,
    );
  }

  if (isLocalTarget && target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Local auth setup requires an HTTP or HTTPS base URL.");
  }
}
