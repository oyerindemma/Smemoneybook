import {
  immutablePreviewOrigin,
  phase3PreviewHostname,
} from "./auth-setup";

export const releaseGateBranch = "phase-3-staging";
export const releaseGateVercelProject = "smemoneybook";

export type VercelPreviewDeployment = {
  url?: string;
  state?: string;
  target?: string | null;
  meta?: {
    githubCommitRef?: string;
    githubCommitSha?: string;
    branchAlias?: string;
  };
};

function deploymentOrigin(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  try {
    const target = new URL(url.includes("://") ? url : `https://${url}`);
    return target.protocol === "https:" ? target.origin : undefined;
  } catch {
    return undefined;
  }
}

export function parseVercelDeploymentList(output: string): VercelPreviewDeployment[] {
  const jsonStart = output.indexOf("{");
  if (jsonStart < 0) {
    throw new Error("Vercel Preview verification did not return JSON.");
  }

  let parsed: { deployments?: unknown };
  try {
    parsed = JSON.parse(output.slice(jsonStart)) as { deployments?: unknown };
  } catch {
    throw new Error("Vercel Preview verification returned malformed JSON.");
  }

  if (!Array.isArray(parsed.deployments)) {
    throw new Error("Vercel Preview verification returned no deployment list.");
  }

  return parsed.deployments as VercelPreviewDeployment[];
}

export function verifyImmutablePreviewDeployment({
  baseURL,
  currentBranch,
  currentCommit,
  deployments,
}: {
  baseURL: string;
  currentBranch: string;
  currentCommit: string;
  deployments: readonly VercelPreviewDeployment[];
}) {
  const expectedOrigin = immutablePreviewOrigin(baseURL);
  if (!expectedOrigin) {
    throw new Error("Release-gate target is not an approved immutable Preview URL.");
  }
  if (currentBranch !== releaseGateBranch) {
    throw new Error(`Release-gate branch must be ${releaseGateBranch}.`);
  }

  const deployment = deployments.find(
    (candidate) => deploymentOrigin(candidate.url) === expectedOrigin,
  );
  if (!deployment) {
    throw new Error("Immutable Preview target was not found in authenticated Vercel metadata.");
  }
  if (deployment.state !== "READY") {
    throw new Error("Immutable Preview target is not Ready.");
  }
  if (deployment.target !== null && deployment.target !== "preview") {
    throw new Error("Immutable Preview target is not a Preview deployment.");
  }
  if (deployment.meta?.githubCommitRef !== releaseGateBranch) {
    throw new Error("Immutable Preview target does not belong to phase-3-staging.");
  }
  if (deployment.meta.githubCommitSha !== currentCommit) {
    throw new Error("Immutable Preview target does not match the current release candidate.");
  }
  if (deployment.meta.branchAlias !== phase3PreviewHostname) {
    throw new Error("Immutable Preview target is not attached to the phase-3-staging alias.");
  }

  return expectedOrigin;
}
