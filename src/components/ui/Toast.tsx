"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

export function Toast({ message }: { message: string }) {
  const [dismissedMessage, setDismissedMessage] = useState("");
  const isError = /wrong|couldn’t|could not|try again|error|failed|offline/i.test(message);
  const visible = Boolean(message) && dismissedMessage !== message;

  useEffect(() => {
    if (!message) {
      return;
    }

    const timer = window.setTimeout(() => setDismissedMessage(message), 3600);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!visible) {
    return null;
  }

  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <div
      className={`fixed inset-x-4 top-4 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border bg-card px-5 py-4 text-sm font-semibold shadow-xl transition-all duration-200 ${
        isError ? "border-danger/20 text-danger" : "border-success/20 text-textPrimary"
      }`}
      role="status"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          isError ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
        }`}
      >
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="leading-5">{message}</span>
    </div>
  );
}
