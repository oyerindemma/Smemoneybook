"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { AssistantInput } from "@/components/assistant/AssistantInput";
import { AssistantMessage } from "@/components/assistant/AssistantMessage";
import { AssistantSuggestedPrompts } from "@/components/assistant/AssistantSuggestedPrompts";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  feedback?: "helpful" | "not_helpful";
};

export function AssistantChat() {
  const { state, setNotice } = useDashboard();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Ask me about sales, customers owing, stock, reports, or VAT estimates. I will keep it simple.",
    },
  ]);
  const [threadId, setThreadId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function sendMessage(text: string) {
    if (!state.businessId || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((current) => [...current, userMessage]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, threadId: threadId || undefined, message: text }),
      });
      const payload = (await response.json().catch(() => null)) as {
        threadId?: string;
        assistantMessageId?: string;
        reply?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.reply) {
        setNotice("MoneyBook Assistant could not reply right now.");
        return;
      }

      setThreadId(payload.threadId ?? "");
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: payload.reply ?? "I could not find enough data to answer that.",
          messageId: payload.assistantMessageId,
        },
      ]);
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    } catch {
      setNotice("MoneyBook Assistant could not reply right now.");
    } finally {
      setIsLoading(false);
    }
  }

  async function rateMessage(messageId: string, rating: "helpful" | "not_helpful") {
    if (!state.businessId) {
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        message.messageId === messageId ? { ...message, feedback: rating } : message,
      ),
    );

    try {
      const response = await fetch("/api/assistant/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: state.businessId, messageId, rating }),
      });

      if (!response.ok) {
        setNotice("Could not save assistant feedback.");
      }
    } catch {
      setNotice("Could not save assistant feedback.");
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-12rem)] flex-col gap-4">
      <AssistantSuggestedPrompts disabled={isLoading} onSelect={(prompt) => void sendMessage(prompt)} />
      <div className="flex-1 space-y-4 rounded-2xl border border-gray-100 bg-background/60 p-4">
        {messages.map((message) => (
          <AssistantMessage
            key={message.id}
            role={message.role}
            content={message.content}
            messageId={message.messageId}
            feedback={message.feedback}
            onFeedback={rateMessage}
          />
        ))}
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-medium text-textSecondary shadow-sm">
            <Loader2 className="animate-spin" size={16} aria-hidden="true" />
            Thinking through your records...
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>
      <AssistantInput disabled={isLoading} onSend={sendMessage} />
    </section>
  );
}
