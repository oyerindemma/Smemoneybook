import type { BillingFeature } from "@/lib/billing/plans";
import type { Permission } from "@/lib/operations/access";

export type ReportDefinition = {
  id: string;
  name: string;
  requiredPermission: Permission;
  requiredEntitlement: BillingFeature;
  dateFilters: ReportDateFilter[];
  dimensions: string[];
  exportFormats: Array<"csv" | "pdf">;
  sourceTables: string[];
  reconciliationRule: string;
};

export type ReportDateFilter =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "quarter"
  | "year"
  | "custom";

const standardDateFilters: ReportDateFilter[] = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "quarter",
  "year",
  "custom",
];

const debtDateFilters: ReportDateFilter[] = ["today", "this_month", "quarter", "year", "custom"];
const stockDateFilters: ReportDateFilter[] = ["today", "this_week", "this_month", "quarter", "year", "custom"];

export const reportDefinitions: ReportDefinition[] = [
  {
    id: "sales_summary",
    name: "Sales summary",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["business", "location", "customer", "product"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "TransactionPayment"],
    reconciliationRule: "Non-reversed sale transactions in the selected period reconcile to sales totals.",
  },
  {
    id: "sales_trend",
    name: "Sales trend",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["day", "week", "month", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction"],
    reconciliationRule: "Trend buckets sum to the sales summary for the same period and filters.",
  },
  {
    id: "expense_summary",
    name: "Expense summary",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["category", "account", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "Account"],
    reconciliationRule: "Non-reversed expense transactions reconcile to total expenses.",
  },
  {
    id: "profit_overview",
    name: "Profit overview",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["business", "location", "product", "category"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "InventoryItem"],
    reconciliationRule: "Sales profit minus expenses reconciles to profit overview.",
  },
  {
    id: "product_profitability",
    name: "Product profitability",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["product", "category", "brand", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "InventoryItem", "ProductCategory", "ProductBrand"],
    reconciliationRule: "Line-item sales minus line-item cost reconciles to product profit.",
  },
  {
    id: "category_performance",
    name: "Category performance",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["category", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "InventoryItem", "ProductCategory"],
    reconciliationRule: "Category rows reconcile to product sales for categorized items.",
  },
  {
    id: "brand_performance",
    name: "Brand performance",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["brand", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "InventoryItem", "ProductBrand"],
    reconciliationRule: "Brand rows reconcile to product sales for branded items.",
  },
  {
    id: "customer_ranking",
    name: "Customer ranking",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["customer", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Customer", "Transaction", "CustomerReturn"],
    reconciliationRule: "Customer totals equal sales minus recorded customer returns.",
  },
  {
    id: "customer_debt_ageing",
    name: "Customer debt ageing",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: debtDateFilters,
    dimensions: ["customer", "age_bucket"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Debt", "Customer"],
    reconciliationRule: "Open customer debt buckets reconcile to total customer balances.",
  },
  {
    id: "supplier_ranking",
    name: "Supplier ranking",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["supplier", "category"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Supplier", "Transaction", "SupplierReturn"],
    reconciliationRule: "Supplier totals equal purchase/expense records minus supplier returns.",
  },
  {
    id: "supplier_bill_ageing",
    name: "Supplier bill ageing",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: debtDateFilters,
    dimensions: ["supplier", "age_bucket"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Debt", "Supplier"],
    reconciliationRule: "Open supplier bill buckets reconcile to total supplier balances.",
  },
  {
    id: "inventory_valuation",
    name: "Inventory valuation",
    requiredPermission: "inventory:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: stockDateFilters,
    dimensions: ["product", "category", "brand", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["InventoryItem", "InventoryBalance"],
    reconciliationRule: "Quantity on hand times cost price reconciles to inventory value by location.",
  },
  {
    id: "location_comparison",
    name: "Location comparison",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["location", "payment_method"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "TransactionPayment", "InventoryBalance"],
    reconciliationRule: "Location totals reconcile to the business summary when all accessible locations are selected.",
  },
  {
    id: "stock_movement",
    name: "Stock movement",
    requiredPermission: "inventory:write",
    requiredEntitlement: "warehouse_transfers",
    dateFilters: stockDateFilters,
    dimensions: ["location", "product", "movement_type"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["InventoryMovement", "InventoryItem", "BusinessLocation"],
    reconciliationRule: "Opening balance plus movements equals closing location inventory balance.",
  },
  {
    id: "inventory_turnover",
    name: "Inventory turnover",
    requiredPermission: "inventory:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: stockDateFilters,
    dimensions: ["product", "category", "brand", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "InventoryItem", "InventoryMovement"],
    reconciliationRule: "Cost of goods sold and average stock value reconcile to inventory movement history.",
  },
  {
    id: "low_stock",
    name: "Low-stock report",
    requiredPermission: "inventory:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: ["today", "custom"],
    dimensions: ["product", "category", "brand", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["InventoryItem", "InventoryBalance"],
    reconciliationRule: "Items appear when current location balance is at or below the configured alert level.",
  },
  {
    id: "returns_refunds",
    name: "Returns and refunds",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["reason", "outcome", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["CustomerReturn", "SupplierReturn", "Transaction"],
    reconciliationRule: "Return totals reconcile to refund or settlement transactions and return item rows.",
  },
  {
    id: "payment_method_mix",
    name: "Payment method mix",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["payment_method", "account", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["TransactionPayment", "Account"],
    reconciliationRule: "Payment method totals reconcile to paid transaction allocations for the same period.",
  },
  {
    id: "cashflow",
    name: "Cashflow report",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["account", "category", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "TransactionPayment", "Account"],
    reconciliationRule: "Cash inflows minus outflows reconcile to account movement totals.",
  },
  {
    id: "staff_sales_performance",
    name: "Staff sales performance",
    requiredPermission: "reports:write",
    requiredEntitlement: "granular_permissions",
    dateFilters: standardDateFilters,
    dimensions: ["staff", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "AuditLog", "User"],
    reconciliationRule: "Staff-attributed sale totals reconcile to captured actor metadata where available.",
  },
  {
    id: "tax_summary",
    name: "Tax summary",
    requiredPermission: "reports:write",
    requiredEntitlement: "tax_management",
    dateFilters: ["this_month", "last_month", "quarter", "year", "custom"],
    dimensions: ["tax_rate", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["TaxRun", "DocumentTaxSnapshot", "Transaction"],
    reconciliationRule: "Tax snapshots are immutable and do not recalculate after settings change.",
  },
  {
    id: "discounts",
    name: "Discounts report",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["product", "customer", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction"],
    reconciliationRule: "Discount totals reconcile to invoice item and order discount metadata.",
  },
  {
    id: "gross_margin",
    name: "Gross margin report",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: standardDateFilters,
    dimensions: ["product", "category", "brand", "location"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "InventoryItem"],
    reconciliationRule: "Gross margin reconciles to sales amount minus cost of goods sold.",
  },
  {
    id: "daily_closing",
    name: "Daily closing report",
    requiredPermission: "reports:write",
    requiredEntitlement: "advanced_reports",
    dateFilters: ["today", "yesterday", "custom"],
    dimensions: ["location", "account", "payment_method"],
    exportFormats: ["csv", "pdf"],
    sourceTables: ["Transaction", "TransactionPayment", "Debt", "Account"],
    reconciliationRule: "Closing totals reconcile sales, expenses, payments, debts, and cash by location/day.",
  },
];

export const legacyReportAliases: Record<string, string> = {
  monthly_summary: "sales_summary",
};

export function findReportDefinition(reportId: string) {
  const canonicalId = legacyReportAliases[reportId] ?? reportId;
  return reportDefinitions.find((report) => report.id === canonicalId) ?? null;
}
