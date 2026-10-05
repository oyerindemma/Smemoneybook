import { describe, expect, it } from "vitest";
import { phase3PreviewHostname } from "../e2e/support/auth-setup";
import {
  parseVercelDeploymentList,
  releaseGateBranch,
  verifyImmutablePreviewDeployment,
  type VercelPreviewDeployment,
} from "../e2e/support/preview-deployment-verification";

const baseURL =
  "https://smemoneybook-rc9qyurg8-emmanuel-oyerindes-projects.vercel.app";
const currentCommit = "80d26a9572a52ce60117754e878089575c417e5c";
const deployment: VercelPreviewDeployment = {
  url: new URL(baseURL).hostname,
  state: "READY",
  target: null,
  meta: {
    githubCommitRef: releaseGateBranch,
    githubCommitSha: currentCommit,
    branchAlias: phase3PreviewHostname,
  },
};

function verify(candidate: VercelPreviewDeployment = deployment) {
  return verifyImmutablePreviewDeployment({
    baseURL,
    currentBranch: releaseGateBranch,
    currentCommit,
    deployments: [candidate],
  });
}

describe("immutable Preview deployment verification", () => {
  it("accepts a Ready Preview matching phase-3-staging and local HEAD", () => {
    expect(verify()).toBe(baseURL);
  });

  it("parses Vercel CLI deployment JSON with leading status output", () => {
    expect(
      parseVercelDeploymentList(`Fetching deployments\n${JSON.stringify({ deployments: [deployment] })}`),
    ).toEqual([deployment]);
  });

  it.each([
    [{ ...deployment, state: "BUILDING" }, "not Ready"],
    [{ ...deployment, target: "production" }, "not a Preview deployment"],
    [
      { ...deployment, meta: { ...deployment.meta, githubCommitRef: "main" } },
      "does not belong to phase-3-staging",
    ],
    [
      { ...deployment, meta: { ...deployment.meta, githubCommitSha: "different" } },
      "does not match the current release candidate",
    ],
    [
      { ...deployment, meta: { ...deployment.meta, branchAlias: "smemoneybook.vercel.app" } },
      "not attached to the phase-3-staging alias",
    ],
  ])("rejects unverified deployment metadata", (candidate, message) => {
    expect(() => verify(candidate as VercelPreviewDeployment)).toThrow(message as string);
  });

  it("rejects another immutable deployment and the wrong local branch", () => {
    expect(() =>
      verify({
        ...deployment,
        url: "smemoneybook-aaaaaaaaa-emmanuel-oyerindes-projects.vercel.app",
      }),
    ).toThrow("was not found in authenticated Vercel metadata");
    expect(() =>
      verifyImmutablePreviewDeployment({
        baseURL,
        currentBranch: "main",
        currentCommit,
        deployments: [deployment],
      }),
    ).toThrow("branch must be phase-3-staging");
  });

  it("fails closed on missing or malformed Vercel CLI JSON", () => {
    expect(() => parseVercelDeploymentList("no json")).toThrow("did not return JSON");
    expect(() => parseVercelDeploymentList("{not-json")).toThrow("malformed JSON");
    expect(() => parseVercelDeploymentList('{"deployments":null}')).toThrow(
      "returned no deployment list",
    );
  });
});
