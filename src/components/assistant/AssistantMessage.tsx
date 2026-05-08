import { Bot, User } from "lucide-react";

export function AssistantMessage({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot size={18} aria-hidden="true" />
        </span>
      ) : null}
      <div
        className={`max-w-[86%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
          isUser
            ? "bg-primary text-white"
            : "border border-gray-100 bg-card text-textPrimary"
        }`}
      >
        {content}
      </div>
      {isUser ? (
        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-textMuted">
          <User size={18} aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}
