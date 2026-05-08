import { createHmac, timingSafeEqual } from "node:crypto";

type InitializeInput = {
  secretKey: string;
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
};

type PaystackInitializeData = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackVerifyData = {
  id?: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  metadata?: {
    userId?: string;
    planId?: string;
    businessId?: string;
  };
};

async function parsePaystackResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;

  if (!response.ok || !payload?.status || !payload.data) {
    throw new Error(payload?.message ?? "Paystack request failed.");
  }

  return payload.data;
}

export async function initializePaystackTransaction(input: InitializeInput) {
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  });

  return parsePaystackResponse<PaystackInitializeData>(response);
}

export async function verifyPaystackTransaction(secretKey: string, reference: string) {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  return parsePaystackResponse<PaystackVerifyData>(response);
}

export function verifyPaystackSignature(rawBody: string, signature: string | null, secretKey: string) {
  if (!signature) {
    return false;
  }

  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const receivedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(receivedBuffer, expectedBuffer);
}
