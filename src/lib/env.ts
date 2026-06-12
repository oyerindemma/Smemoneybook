import { z } from "zod";

const safeEnvString = (schema: z.ZodString = z.string()) =>
  z.preprocess((val) => val ?? "", schema);

const appEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url("NEXT_PUBLIC_APP_URL must be a valid URL.").optional(),
});

const whatsappEnvSchema = z.object({
  WHATSAPP_ACCESS_TOKEN: safeEnvString(z.string().min(1, "WHATSAPP_ACCESS_TOKEN is required.")),
  WHATSAPP_PHONE_NUMBER_ID: safeEnvString(z.string().min(1, "WHATSAPP_PHONE_NUMBER_ID is required.")),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: safeEnvString(z.string().min(16, "WHATSAPP_WEBHOOK_VERIFY_TOKEN must be at least 16 characters.")),
  WHATSAPP_BUSINESS_ACCOUNT_ID: safeEnvString(z.string().min(1, "WHATSAPP_BUSINESS_ACCOUNT_ID is required.")),
  WHATSAPP_APP_SECRET: safeEnvString(z.string().min(1)).optional(),
});

const openAIEnvSchema = z.object({
  OPENAI_API_KEY: safeEnvString(z.string().min(1, "OPENAI_API_KEY is required.")),
  OPENAI_MODEL: safeEnvString(z.string().min(1)).default("gpt-4.1-mini"),
});

const cronEnvSchema = z.object({
  CRON_SECRET: safeEnvString(z.string().min(16, "CRON_SECRET must be at least 16 characters.")),
});

export type AppEnv = z.infer<typeof appEnvSchema> & {
  NEXT_PUBLIC_APP_URL: string;
};

export type WhatsAppEnv = z.infer<typeof whatsappEnvSchema>;
export type OpenAIEnv = z.infer<typeof openAIEnvSchema>;

export function getAppEnv(): AppEnv {
  const parsed = appEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatEnvError("app", parsed.error));
  }

  return {
    NEXT_PUBLIC_APP_URL: (parsed.data.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  };
}

export function getWhatsAppEnv(): WhatsAppEnv {
  const parsed = whatsappEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatEnvError("WhatsApp", parsed.error));
  }

  return parsed.data;
}

export function getWhatsAppWebhookVerifyToken() {
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!token) {
    throw new Error("WhatsApp webhook verification is not configured. Add WHATSAPP_WEBHOOK_VERIFY_TOKEN.");
  }

  return token;
}

export function getOpenAIEnv(): OpenAIEnv {
  const parsed = openAIEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatEnvError("OpenAI", parsed.error));
  }

  return parsed.data;
}

export function getCronSecret() {
  const parsed = cronEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatEnvError("cron", parsed.error));
  }

  return parsed.data.CRON_SECRET;
}

function formatEnvError(scope: string, error: z.ZodError) {
  const details = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  return `Invalid ${scope} environment configuration. ${details}`;
}
