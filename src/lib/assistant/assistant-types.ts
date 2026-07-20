export type AssistantRole = "user" | "assistant" | "tool";

export type AssistantChatMessage = {
  id?: string;
  role: AssistantRole;
  content: string;
};

export type AssistantContext = {
  businessId: string;
  businessName: string;
  currency: "NGN";
  generatedAt: string;
  periods: {
    today: {
      start: string;
      end: string;
      label: string;
    };
    month: {
      start: string;
      end: string;
      label: string;
    };
  };
  today: {
    income: number;
    expenses: number;
    profit: number;
    transactionCount: number;
  };
  debts: {
    customerDebtTotal: number;
    supplierDebtTotal: number;
    overdueCount: number;
    topDebtors: Array<{ name: string; amount: number; overdue: boolean }>;
  };
  stock: {
    lowStockCount: number;
    lowStockItems: Array<{ name: string; quantityOnHand: number; lowStockLevel: number }>;
  };
  invoices: {
    unpaidCount: number;
    unpaidTotal: number;
  };
  report: {
    monthIncome: number;
    monthExpenses: number;
    monthProfit: number;
    vatEstimate: number;
    transactionCount: number;
  };
};

export type AssistantToolName =
  | "get_today_summary"
  | "get_debt_summary"
  | "get_low_stock_items"
  | "get_invoice_summary"
  | "get_monthly_report_summary"
  | "draft_whatsapp_debt_reminder"
  | "prepare_stock_alert"
  | "prepare_invoice_message"
  | "send_whatsapp_message"
  | "create_invoice"
  | "record_payment"
  | "adjust_stock";

export type AssistantToolResult = {
  ok: boolean;
  tool: AssistantToolName;
  data?: unknown;
  citations?: import("@/lib/assistant/source-metrics").AssistantSourceCitation[];
  pendingActionRequired?: boolean;
  message?: string;
};
