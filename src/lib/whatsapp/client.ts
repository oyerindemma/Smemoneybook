import { getWhatsAppEnv } from "@/lib/env";
import type { WhatsAppTemplateRequest } from "@/lib/whatsapp/types";

type GraphSendResponse = {
  messaging_product?: "whatsapp";
  contacts?: Array<{ input?: string; wa_id?: string }>;
  messages?: Array<{ id: string; message_status?: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class WhatsAppClientError extends Error {
  status?: number;
  code?: number;
  retryable: boolean;

  constructor(message: string, options: { status?: number; code?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "WhatsAppClientError";
    this.status = options.status;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

type WhatsAppClientOptions = {
  accessToken?: string;
  phoneNumberId?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
};

export class WhatsAppClient {
  private accessToken: string;
  private phoneNumberId: string;
  private fetcher: typeof fetch;
  private timeoutMs: number;
  private retries: number;

  constructor(options: WhatsAppClientOptions = {}) {
    const env = options.accessToken && options.phoneNumberId ? null : getWhatsAppEnv();
    this.accessToken = options.accessToken ?? env?.WHATSAPP_ACCESS_TOKEN ?? "";
    this.phoneNumberId = options.phoneNumberId ?? env?.WHATSAPP_PHONE_NUMBER_ID ?? "";
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
  }

  async sendText(to: string, body: string) {
    return this.postMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    });
  }

  async sendTextMessage(to: string, body: string) {
    return this.sendText(to, body);
  }

  async sendTemplate(to: string, template: WhatsAppTemplateRequest) {
    return this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.languageCode ?? "en" },
        components: template.components,
      },
    });
  }

  async sendTemplateMessage(to: string, template: WhatsAppTemplateRequest) {
    return this.sendTemplate(to, template);
  }

  private async postMessage(payload: Record<string, unknown>): Promise<GraphSendResponse> {
    this.assertConfigured();
    const url = `https://graph.facebook.com/v22.0/${this.phoneNumberId}/messages`;
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, payload);
        const data = (await response.json().catch(() => ({}))) as GraphSendResponse;

        if (!response.ok || data.error) {
          throw normalizeWhatsAppError(data, response.status);
        }

        console.info("whatsapp.message.sent", {
          messageId: data.messages?.[0]?.id,
          attempt,
        });
        return data;
      } catch (error) {
        lastError = error;
        const normalized = normalizeUnknownError(error);

        console.warn("whatsapp.message.failed_attempt", {
          attempt,
          retryable: normalized.retryable,
          status: normalized.status,
          message: normalized.message,
        });

        if (!normalized.retryable || attempt >= this.retries) {
          throw normalized;
        }

        await sleep(250 * 2 ** attempt);
      }
    }

    throw normalizeUnknownError(lastError);
  }

  private async fetchWithTimeout(url: string, payload: Record<string, unknown>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetcher(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private assertConfigured() {
    if (!this.accessToken || !this.phoneNumberId) {
      throw new WhatsAppClientError(
        "WhatsApp Cloud API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
        { retryable: false },
      );
    }
  }
}

let client: WhatsAppClient | null = null;

export function getWhatsAppClient() {
  if (!client) {
    client = new WhatsAppClient();
  }

  return client;
}

export function sendTextMessage(to: string, body: string) {
  return getWhatsAppClient().sendTextMessage(to, body);
}

export function sendTemplateMessage(to: string, template: WhatsAppTemplateRequest) {
  return getWhatsAppClient().sendTemplateMessage(to, template);
}

function normalizeWhatsAppError(data: GraphSendResponse, status: number) {
  const retryable = status === 408 || status === 429 || status >= 500;
  return new WhatsAppClientError(data.error?.message ?? "WhatsApp API request failed.", {
    status,
    code: data.error?.code,
    retryable,
  });
}

export function normalizeUnknownError(error: unknown) {
  if (error instanceof WhatsAppClientError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new WhatsAppClientError("WhatsApp API request timed out.", { retryable: true });
  }

  return new WhatsAppClientError(
    error instanceof Error ? error.message : "WhatsApp API request failed.",
    { retryable: false },
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
