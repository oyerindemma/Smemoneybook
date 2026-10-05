import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const result = spawnSync(playwrightBinary, ["test", ...playwrightArguments], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    [releaseScopeModeEnv]: approvedReleaseScopeName,
    [strictReleaseGateEnv]: scopeOnly ? "false" : "true",
  },
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
