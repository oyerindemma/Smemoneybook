import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafeAuthSetupTarget,
  immutablePreviewOrigin,
  verifiedPreviewOriginEnv,
} from "../tests/e2e/support/auth-setup";
import {
  parseVercelDeploymentList,
  releaseGateVercelProject,
  verifyImmutablePreviewDeployment,
} from "../tests/e2e/support/preview-deployment-verification";
import {
  approvedReleaseScopeName,
  releaseScopeModeEnv,
  strictReleaseGateEnv,
} from "../tests/e2e/support/release-gate-policy";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const playwrightBinary = path.join(
  repositoryRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "playwright.cmd" : "playwright",
);
const rawArguments = process.argv.slice(2);
const scopeOnly = rawArguments.includes("--scope-only");
const playwrightArguments = rawArguments.filter((argument) => argument !== "--scope-only");
const childEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  [releaseScopeModeEnv]: approvedReleaseScopeName,
  [strictReleaseGateEnv]: scopeOnly ? "false" : "true",
};

delete childEnvironment[verifiedPreviewOriginEnv];

function runVerificationCommand(command: string, arguments_: string[], description: string) {
  const verification = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
  });

  if (verification.error || verification.status !== 0) {
    throw new Error(`${description} failed.`);
  }

  return verification.stdout;
}

try {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;
  const previewOrigin = immutablePreviewOrigin(baseURL);

  if (previewOrigin && baseURL) {
    const currentBranch = runVerificationCommand(
      "git",
      ["branch", "--show-current"],
      "Release-gate branch verification",
    ).trim();
    const currentCommit = runVerificationCommand(
      "git",
      ["rev-parse", "HEAD"],
      "Release-gate commit verification",
    ).trim();
    const npxBinary = process.platform === "win32" ? "npx.cmd" : "npx";
    const deploymentOutput = runVerificationCommand(
      npxBinary,
      [
        "--yes",
        "vercel@62.2.0",
        "list",
        releaseGateVercelProject,
        "--environment",
        "preview",
        "--json",
        "--limit",
        "20",
        "--non-interactive",
        "--no-color",
      ],
      "Authenticated Vercel Preview verification",
    );

    childEnvironment[verifiedPreviewOriginEnv] = verifyImmutablePreviewDeployment({
      baseURL,
      currentBranch,
      currentCommit,
      deployments: parseVercelDeploymentList(deploymentOutput),
    });
    console.log(
      `[release-gate] Verified immutable Preview ${previewOrigin} for ${currentCommit.slice(0, 12)}.`,
    );
  } else if (baseURL) {
    assertSafeAuthSetupTarget(baseURL, undefined);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown Preview verification error.";
  console.error(`[release-gate] ${message}`);
  process.exit(1);
}

const result = spawnSync(playwrightBinary, ["test", ...playwrightArguments], {
  cwd: repositoryRoot,
  env: childEnvironment,
  stdio: "inherit",
});

if (result.error) {
  console.error(`[release-gate] Could not start Playwright: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`[release-gate] Playwright exited after signal ${result.signal}.`);
  process.exit(1);
}

process.exit(result.status ?? 1);
