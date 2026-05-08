import { AssistantChat } from "@/components/assistant/AssistantChat";

export default function AssistantPage() {
  return (
    <main className="space-y-6 md:space-y-8">
      <header>
        <p className="text-sm font-semibold text-primary">MoneyBook Assistant</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight md:text-2xl">Ask about your business</h1>
        <p className="mt-1 text-sm text-textSecondary md:text-base">
          Simple answers about sales, debt, stock, reports, and reminders.
        </p>
      </header>
      <AssistantChat />
    </main>
  );
}
