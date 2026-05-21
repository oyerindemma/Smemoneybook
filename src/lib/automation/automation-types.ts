export type AutomationSuggestionType =
  | "daily_money_reminder"
  | "debt_reminder_suggestion"
  | "low_stock_alert"
  | "weekly_summary"
  | "inactive_recovery"
  | "business_moment"
  | "smart_insight";

export type AutomationSuggestion = {
  idempotencyKey: string;
  businessId: string;
  type: AutomationSuggestionType;
  message: string;
  metadata?: Record<string, unknown>;
};
