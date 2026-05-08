const requiredPaystackEnv = [
  "PAYSTACK_PUBLIC_KEY",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
  "NEXT_PUBLIC_APP_URL",
] as const;

export function isPaystackConfigured() {
  return requiredPaystackEnv.every((key) => Boolean(process.env[key]));
}

export function getPaystackEnv() {
  const missing = requiredPaystackEnv.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing Paystack environment variables: ${missing.join(", ")}`);
  }

  return {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY as string,
    secretKey: process.env.PAYSTACK_SECRET_KEY as string,
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET as string,
    appUrl: (process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, ""),
  };
}
