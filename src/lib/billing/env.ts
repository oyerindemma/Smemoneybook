const requiredPaystackEnv = [
  "PAYSTACK_PUBLIC_KEY",
  "PAYSTACK_SECRET_KEY",
  "NEXT_PUBLIC_APP_URL",
] as const;

export function isPaystackConfigured() {
  try {
    getPaystackEnv();
    return true;
  } catch {
    return false;
  }
}

export function getPaystackEnv() {
  const missing = requiredPaystackEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing Paystack environment variables: ${missing.join(", ")}`);
  }

  const publicKey = process.env.PAYSTACK_PUBLIC_KEY as string;
  const secretKey = process.env.PAYSTACK_SECRET_KEY as string;

  validatePaystackKeyMode(publicKey, secretKey);

  return {
    publicKey,
    secretKey,
    appUrl: (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, ""),
  };
}

function validatePaystackKeyMode(publicKey: string, secretKey: string) {
  const publicMode = getPaystackKeyMode(publicKey, "PAYSTACK_PUBLIC_KEY");
  const secretMode = getPaystackKeyMode(secretKey, "PAYSTACK_SECRET_KEY");

  if (publicMode !== secretMode) {
    throw new Error("Paystack public and secret keys must both be test keys or both be live keys.");
  }

  if (isProductionDeploy() && publicMode !== "live") {
    throw new Error("Production billing requires Paystack live keys. Set PAYSTACK_PUBLIC_KEY=pk_live_... and PAYSTACK_SECRET_KEY=sk_live_...");
  }
}

function getPaystackKeyMode(key: string, name: string) {
  const expectedPrefix = name === "PAYSTACK_PUBLIC_KEY" ? "pk_" : "sk_";

  if (!key.startsWith(expectedPrefix)) {
    throw new Error(`${name} must be a valid Paystack ${expectedPrefix === "pk_" ? "public" : "secret"} key.`);
  }

  if (key.startsWith(`${expectedPrefix}test_`)) {
    return "test";
  }

  if (key.startsWith(`${expectedPrefix}live_`)) {
    return "live";
  }

  throw new Error(`${name} must be a valid Paystack key starting with ${expectedPrefix}test_ or ${expectedPrefix}live_.`);
}

function isProductionDeploy() {
  return process.env.VERCEL_ENV === "production" || (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV);
}
