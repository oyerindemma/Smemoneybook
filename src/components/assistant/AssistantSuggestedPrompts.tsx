const prompts = [
  "How much did I make today?",
  "Who owes me money?",
  "What stock is low?",
  "Summarize this month",
  "Explain my VAT estimate",
];

export function AssistantSuggestedPrompts({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          className="shrink-0 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-textPrimary shadow-sm hover:bg-background disabled:opacity-50"
          type="button"
          disabled={disabled}
          onClick={() => onSelect(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
