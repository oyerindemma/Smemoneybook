import { getOpenAIEnv } from "@/lib/env";
import { assistantSystemPrompt } from "@/lib/assistant/assistant-system-prompt";
import { sanitizeAssistantText } from "@/lib/assistant/assistant-guardrails";
import { getLocalAssistantResponse } from "@/lib/assistant/assistant-router";
import { assistantToolDefinitions, executeAssistantTool } from "@/lib/assistant/assistant-tools";
import { formatAssistantGrounding } from "@/lib/assistant/source-metrics";
import type { AssistantToolName, AssistantToolResult } from "@/lib/assistant/assistant-types";

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
    const local = await getLocalAssistantResponse({ businessId, userId, message });
    return {
      reply: local.reply,
      toolResults: local.toolResults,
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
    const local = await getLocalAssistantResponse({ businessId, userId, message });
    return {
      reply: local.reply,
      toolResults: local.toolResults,
      provider: "local-grounded",
    };
  }

  const executedTools = await Promise.all(
    calls.map(async (call) => {
      return executeAssistantTool({
        toolName: call.name as AssistantToolName,
        businessId,
        userId,
        args: safeJson(call.arguments),
      });
    }),
  );
  const toolOutputs = calls.map((call, index) => {
    const result = executedTools[index];
    return {
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(result),
    };
  });

  if (!executedTools.some((result) => result.ok)) {
    const local = await getLocalAssistantResponse({ businessId, userId, message });
    return {
      reply: local.reply,
      toolResults: executedTools,
      provider: "local-grounded",
    };
  }

  const final = await callResponsesApi(env, [
    { role: "system", content: assistantSystemPrompt },
    { role: "user", content: sanitizeAssistantText(message) },
    ...calls,
    ...toolOutputs,
  ]);

  const reply = appendGrounding(
    extractOutputText(final) || fallbackFromToolResults(executedTools),
    executedTools,
  );

  return {
    reply,
    toolResults: executedTools,
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

function appendGrounding(reply: string, toolResults: AssistantToolResult[]) {
  const citations = toolResults.flatMap((result) => result.citations ?? []);
  const grounding = formatAssistantGrounding(citations);

  if (!grounding || reply.includes("Grounding:")) {
    return reply;
  }

  return `${reply}${grounding}`;
}

function fallbackFromToolResults(toolResults: AssistantToolResult[]) {
  const first = toolResults.find((result) => result.ok);

  if (!first) {
    return "I could not find enough authorized business records to answer that.";
  }

  return `I found recorded business data for ${first.tool}. Please review the source details below.`;
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
