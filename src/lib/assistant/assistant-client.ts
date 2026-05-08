import { getOpenAIEnv } from "@/lib/env";
import { assistantSystemPrompt } from "@/lib/assistant/assistant-system-prompt";
import { sanitizeAssistantText } from "@/lib/assistant/assistant-guardrails";
import { getLocalAssistantReply } from "@/lib/assistant/assistant-router";
import { assistantToolDefinitions, executeAssistantTool } from "@/lib/assistant/assistant-tools";
import type { AssistantToolName } from "@/lib/assistant/assistant-types";

type ResponseOutput = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type OpenAIResponse = {
  id?: string;
  output_text?: string;
  output?: ResponseOutput[];
};

export async function createAssistantReply({
  businessId,
  userId,
  message,
}: {
  businessId: string;
  userId: string;
  message: string;
}) {
  let env: ReturnType<typeof getOpenAIEnv>;
  try {
    env = getOpenAIEnv();
  } catch {
    return {
      reply: await getLocalAssistantReply(businessId, message),
      toolResults: [],
      provider: "local",
    };
  }

  const first = await callResponsesApi(env, [
    { role: "system", content: assistantSystemPrompt },
    { role: "user", content: sanitizeAssistantText(message) },
  ]);
  const calls = (first.output ?? []).filter(
    (item) => item.type === "function_call" && item.name && item.call_id,
  );

  if (calls.length === 0) {
    return {
      reply: extractOutputText(first) || (await getLocalAssistantReply(businessId, message)),
      toolResults: [],
      provider: "openai",
    };
  }

  const toolOutputs = await Promise.all(
    calls.map(async (call) => {
      const result = await executeAssistantTool({
        toolName: call.name as AssistantToolName,
        businessId,
        userId,
        args: safeJson(call.arguments),
      });
      return {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      };
    }),
  );

  const final = await callResponsesApi(env, [
    { role: "system", content: assistantSystemPrompt },
    { role: "user", content: sanitizeAssistantText(message) },
    ...calls,
    ...toolOutputs,
  ]);

  return {
    reply: extractOutputText(final) || (await getLocalAssistantReply(businessId, message)),
    toolResults: toolOutputs,
    provider: "openai",
  };
}

async function callResponsesApi(
  env: ReturnType<typeof getOpenAIEnv>,
  input: Array<Record<string, unknown>>,
): Promise<OpenAIResponse> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input,
      tools: assistantToolDefinitions,
      tool_choice: "auto",
    }),
  });

  if (!response.ok) {
    throw new Error("Assistant provider failed.");
  }

  return (await response.json()) as OpenAIResponse;
}

function extractOutputText(response: OpenAIResponse) {
  if (response.output_text) {
    return sanitizeAssistantText(response.output_text);
  }

  const message = response.output?.find((item) => item.type === "message");
  const text = message?.content?.find((item) => item.type === "output_text")?.text;
  return text ? sanitizeAssistantText(text) : "";
}

function safeJson(value?: string) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}
