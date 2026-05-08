import { Send } from "lucide-react";
import { FormEvent, useState } from "react";

export function AssistantInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || disabled) {
      return;
    }

    setMessage("");
    await onSend(text);
  }

  return (
    <form className="flex gap-2 rounded-2xl border border-gray-200 bg-card p-2 shadow-sm" onSubmit={submit}>
      <input
        className="min-h-12 flex-1 rounded-xl bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-primary/20"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Ask about sales, debt, stock, VAT..."
        disabled={disabled}
      />
      <button
        className="inline-flex min-h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-sm hover:bg-primaryHover disabled:opacity-50"
        type="submit"
        disabled={disabled || !message.trim()}
        aria-label="Send message"
      >
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  );
}
