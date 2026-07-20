import { Bot, ThumbsDown, ThumbsUp, User } from "lucide-react";

export function AssistantMessage({
  role,
  content,
  messageId,
  feedback,
  onFeedback,
}: {
  role: "user" | "assistant";
  content: string;
  messageId?: string;
  feedback?: "helpful" | "not_helpful";
  onFeedback?: (messageId: string, rating: "helpful" | "not_helpful") => void;
}) {
  const isUser = role === "user";
  const canRate = Boolean(!isUser && messageId && onFeedback);

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
        {canRate ? (
          <div className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3">
            <button
              aria-label="Mark assistant answer helpful"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                feedback === "helpful"
                  ? "border-success bg-success/10 text-success"
                  : "border-gray-200 text-textMuted hover:bg-background"
              }`}
              title="Helpful"
              type="button"
              onClick={() => messageId && onFeedback?.(messageId, "helpful")}
            >
              <ThumbsUp size={15} aria-hidden="true" />
            </button>
            <button
              aria-label="Mark assistant answer not helpful"
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${
                feedback === "not_helpful"
                  ? "border-danger bg-danger/10 text-danger"
                  : "border-gray-200 text-textMuted hover:bg-background"
              }`}
              title="Not helpful"
              type="button"
              onClick={() => messageId && onFeedback?.(messageId, "not_helpful")}
            >
              <ThumbsDown size={15} aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>
      {isUser ? (
        <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background text-textMuted">
          <User size={18} aria-hidden="true" />
        </span>
      ) : null}
    </div>
  );
}
