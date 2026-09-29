type OpenAIResponsesRequest = {
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
  maxAttempts?: number;
};

export async function requestOpenAIResponses<T>({
  apiKey,
  body,
  timeoutMs = 15_000,
  maxAttempts = 2,
}: OpenAIResponsesRequest): Promise<T> {
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, store: false }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      lastStatus = response.status;

      if (response.ok) {
        const payload = await response.json() as unknown;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("AI provider returned an invalid response.");
        }
        return payload as T;
      }

      if (!isRetryableStatus(response.status) || attempt === maxAttempts) {
        break;
      }
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableNetworkError(error)) {
        throw new Error("AI provider request failed.");
      }
    }

    await delay(150 * attempt);
  }

  throw new Error(lastStatus ? `AI provider request failed with status ${lastStatus}.` : "AI provider request failed.");
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableNetworkError(error: unknown) {
  return error instanceof TypeError ||
    (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
