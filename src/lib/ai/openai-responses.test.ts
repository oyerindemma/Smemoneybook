import { afterEach, describe, expect, it, vi } from "vitest";
import { requestOpenAIResponses } from "@/lib/ai/openai-responses";

describe("OpenAI Responses client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps credentials in the Authorization header and applies a bounded request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestOpenAIResponses<{ output_text: string }>({
      apiKey: "sk-project-secret",
      body: { model: "approved-model", max_output_tokens: 100 },
      maxAttempts: 1,
    });

    expect(result.output_text).toBe("ok");
    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers.Authorization).toBe("Bearer sk-project-secret");
    expect(String(request.body)).not.toContain("sk-project-secret");
    expect(JSON.parse(String(request.body))).toMatchObject({ store: false });
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries one transient response and then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ output_text: "recovered" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await requestOpenAIResponses<{ output_text: string }>({
      apiKey: "sk-project-secret",
      body: { model: "approved-model" },
      maxAttempts: 2,
    });

    expect(result.output_text).toBe("recovered");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry permanent provider errors or expose the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestOpenAIResponses({
      apiKey: "sk-project-secret",
      body: { model: "approved-model" },
      maxAttempts: 2,
    })).rejects.toThrow("status 400");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
