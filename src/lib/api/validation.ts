import { z } from "zod";
import { PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE } from "@/lib/auth/password-policy";
import { hasNullishValue, logMalformedPayload, sanitizePayload } from "@/lib/utils/sanitize";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

const safeString = (schema: z.ZodType<string> = z.string()) =>
  z.preprocess((val) => val ?? "", schema);

const safeEmail = (message: string) =>
  safeString(z.email(message).trim().toLowerCase());

const optionalText = safeString(z.string().trim().max(240)).optional();
const optionalLongText = safeString(z.string().trim().max(2_000)).optional();

const defaultText = (fallback: string) =>
  safeString(z.string().trim().max(240)).transform((value) => value || fallback);

const requiredText = (label: string, max = 120) =>
  z.preprocess(
    (val) => val ?? "",
    z
      .string({ error: `${label} is required.` })
      .trim()
      .min(1, `${label} is required.`)
      .max(max, `${label} is too long.`),
  );

const selectedBusinessId = requiredText("Business", 240);
const pinCode = safeString(z.string().regex(/^\d{6}$/, "Enter a 6-digit PIN."));
const paymentMethodSchema = z.enum([
  "cash",
  "bank_transfer",
  "pos_terminal",
  "card",
  "wallet",
  "credit",
  "other",
]);
const stockAdjustmentTypeSchema = z.enum([
  "stock_in",
  "stock_out",
  "damaged",
  "expired",
  "lost",
  "theft",
  "count_correction",
  "personal_use",
  "promotional_giveaway",
  "supplier_return",
  "customer_return",
  "other",
]);

const returnDispositionSchema = z.enum([
  "sellable_stock",
  "damaged_stock",
  "no_stock",
]);

const customerReturnOutcomeSchema = z.enum([
  "cash_refund",
  "transfer_refund",
  "store_credit",
  "exchange",
  "reduce_customer_balance",
]);

const supplierReturnSettlementSchema = z.enum([
  "supplier_credit",
  "refund_received",
  "replacement_expected",
  "reduce_supplier_bill",
]);

const businessLocationTypeSchema = z.enum([
  "main_shop",
  "warehouse",
  "branch",
  "storage",
  "virtual",
  "damaged_goods",
  "transit",
]);

const localeSchema = z.enum(["en", "fr", "sw", "ha", "yo", "ig"]);
const exportFormatSchema = z.enum(["csv", "pdf"]);
const taxRateTypeSchema = z.enum(["vat", "zero_rated", "exempt", "custom"]);
const announcementStatusSchema = z.enum(["draft", "published", "archived"]);

const paymentAllocationSchema = z.object({
  method: paymentMethodSchema,
  amount: z.coerce.number().finite().positive("Enter a payment amount greater than zero."),
  accountId: optionalText,
  note: optionalText,
});

export const registerRequestSchema = z.object({
  name: requiredText("Your name"),
  email: safeEmail("Enter a valid email."),
  password: safeString(z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE)),
  pin: pinCode,
  businessName: optionalText,
  referralCode: optionalText,
});

export const loginRequestSchema = z.object({
  email: safeEmail("Enter a valid email."),
  password: safeString(z.string().min(1, "Enter your password or PIN.")),
});

export const passwordResetRequestSchema = z.object({
  email: safeEmail("Enter a valid email."),
});

export const passwordResetConfirmSchema = z.object({
  token: requiredText("Reset link", 240),
  password: safeString(z.string().min(PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH_MESSAGE)),
  pin: pinCode,
});

export const businessRequestSchema = z.object({
  name: requiredText("Business name"),
});

export const businessLocationRequestSchema = z.object({
  businessId: selectedBusinessId,
  name: requiredText("Location name"),
  type: businessLocationTypeSchema.default("branch"),
  address: optionalText,
  phone: optionalText,
  email: optionalText,
});

export const businessLocationArchiveRequestSchema = z.object({
  businessId: selectedBusinessId,
});

export const onboardingSetupRequestSchema = z.object({
  businessName: requiredText("Business name"),
  businessCategory: optionalText,
  businessType: z
    .enum([
      "Retail",
      "Retail shop",
      "Services",
      "Food",
      "Restaurant",
      "Food business",
      "POS business",
      "Fashion",
      "Pharmacy",
      "Freelancer",
      "Beauty salon",
      "Electronics",
      "Logistics",
      "Other",
    ])
    .default("Retail"),
  country: z.enum(["NG", "GH", "KE", "ZA", "UG", "TZ", "RW", "OTHER"]).default("NG"),
  currency: z.enum(["NGN", "GHS", "KES", "ZAR", "UGX", "TZS", "RWF", "USD"]).default("NGN"),
  mainGoal: optionalText,
});

export const transactionRequestSchema = z
  .object({
    idempotencyKey: optionalText,
    businessId: selectedBusinessId,
    locationId: optionalText,
    type: z.enum(["sale", "expense", "transfer"]),
    amount: z.coerce.number().finite().positive("Enter an amount greater than zero."),
    accountId: requiredText("Account"),
    destinationAccountId: optionalText,
    description: defaultText("Activity"),
    category: optionalText,
    paymentStatus: z.enum(["paid", "credit", "unpaid"]),
    partyName: optionalText,
    partyPhone: optionalText,
    inventoryItemId: optionalText,
    inventoryQuantity: z.coerce.number().finite().positive().optional(),
    invoiceItems: z
      .array(
        z.object({
          inventoryItemId: requiredText("Product"),
          quantity: z.coerce.number().finite().positive(),
        }),
      )
      .optional(),
    costOfGoods: z.coerce.number().finite().nonnegative().optional(),
    occurredAt: optionalText,
    dueAt: optionalText,
    paymentAllocations: z.array(paymentAllocationSchema).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === "sale" && value.paymentStatus === "unpaid") {
      context.addIssue({
        code: "custom",
        path: ["paymentStatus"],
        message: "Sales are either paid now or customer credit.",
      });
    }

    if (value.type === "expense" && value.paymentStatus === "credit") {
      context.addIssue({
        code: "custom",
        path: ["paymentStatus"],
        message: "Expenses are either paid now or supplier bills.",
      });
    }

    if (value.occurredAt && Number.isNaN(Date.parse(value.occurredAt))) {
      context.addIssue({
        code: "custom",
        path: ["occurredAt"],
        message: "Choose a valid transaction date.",
      });
    }

    if (value.dueAt && Number.isNaN(Date.parse(value.dueAt))) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "Choose a valid due date.",
      });
    }

    if (value.type === "transfer" && !value.destinationAccountId) {
      context.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Choose where the transfer is going.",
      });
    }

    if (value.type === "transfer" && value.paymentStatus !== "paid") {
      context.addIssue({
        code: "custom",
        path: ["paymentStatus"],
        message: "Transfers must move money now.",
      });
    }

    if (value.type === "transfer" && value.destinationAccountId === value.accountId) {
      context.addIssue({
        code: "custom",
        path: ["destinationAccountId"],
        message: "Choose two different accounts for a transfer.",
      });
    }

    if (value.inventoryItemId && value.type !== "sale") {
      context.addIssue({
        code: "custom",
        path: ["inventoryItemId"],
        message: "Products can only be attached to sales.",
      });
    }

    if (value.invoiceItems?.length && value.type !== "sale") {
      context.addIssue({
        code: "custom",
        path: ["invoiceItems"],
        message: "Products can only be attached to sales.",
      });
    }

    if (value.paymentAllocations?.length) {
      const paidTotal = value.paymentAllocations
        .filter((allocation) => allocation.method !== "credit")
        .reduce((total, allocation) => total + allocation.amount, 0);

      if (paidTotal - value.amount > 0.01) {
        context.addIssue({
          code: "custom",
          path: ["paymentAllocations"],
          message: "Payment amounts cannot be more than the sale total.",
        });
      }

      if (value.type !== "sale") {
        context.addIssue({
          code: "custom",
          path: ["paymentAllocations"],
          message: "Split payments are only available for sales.",
        });
      }

      if (value.type === "sale" && value.amount - paidTotal > 0.01 && !value.partyName) {
        context.addIssue({
          code: "custom",
          path: ["partyName"],
          message: "Choose a customer when the sale is not fully paid.",
        });
      }
    }
  });

export const offlineTransactionsRequestSchema = z.object({
  businessId: selectedBusinessId,
  captures: z.array(
    z.object({
      clientId: requiredText("Offline entry id"),
      transaction: transactionRequestSchema,
    }),
  ).min(1, "Add at least one offline entry."),
});

export const offlineSyncOperationRequestSchema = z.object({
  businessId: selectedBusinessId,
  operationId: requiredText("Offline operation id"),
  operationType: z.enum(["transaction", "stock"]),
  status: z.enum(["FAILED", "CONFLICT"]),
  retryCount: z.coerce.number().int().nonnegative().default(0),
  errorMessage: optionalLongText,
  payloadSummary: z.record(z.string(), z.unknown()).default({}),
});

export const offlineSyncOperationResolveRequestSchema = z.object({
  businessId: selectedBusinessId,
  operationId: requiredText("Offline operation id"),
});

export const accountRequestSchema = z.object({
  businessId: selectedBusinessId,
  name: requiredText("Account name"),
  type: z.enum(["cash", "bank", "pos", "mobile_money"]),
  openingBalance: z.coerce.number().finite().nonnegative().default(0),
});

export const reversalRequestSchema = z.object({
  businessId: selectedBusinessId,
  reason: optionalText,
});

export const inventoryItemRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  name: requiredText("Product name"),
  sku: optionalText,
  barcode: optionalText,
  unitId: optionalText,
  unitName: optionalText,
  baseUnitId: optionalText,
  baseUnitName: optionalText,
  sellingUnitId: optionalText,
  sellingUnitName: optionalText,
  conversionFactor: z.coerce.number().finite().positive().optional(),
  categoryId: optionalText,
  categoryName: optionalText,
  brandId: optionalText,
  brandName: optionalText,
  sellingPrice: z.coerce.number().finite().nonnegative(),
  costPrice: z.coerce.number().finite().nonnegative(),
  quantityOnHand: z.coerce.number().finite().nonnegative().default(0),
  lowStockLevel: z.coerce.number().finite().nonnegative().default(5),
}).superRefine((value, context) => {
  if ((value.sellingUnitId || value.sellingUnitName) && !value.conversionFactor) {
    context.addIssue({
      code: "custom",
      path: ["conversionFactor"],
      message: "Enter the unit conversion value.",
    });
  }
});

export const inventoryMovementRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  quantity: z.coerce.number().finite().positive("Enter a stock quantity greater than zero."),
  adjustmentType: stockAdjustmentTypeSchema.optional(),
  reason: optionalText,
  note: optionalText,
  attachmentUrl: optionalText,
  idempotencyKey: optionalText,
}).superRefine((value, context) => {
  const sensitiveReductionTypes = new Set([
    "damaged",
    "expired",
    "lost",
    "theft",
    "personal_use",
    "promotional_giveaway",
  ]);

  if (value.adjustmentType && sensitiveReductionTypes.has(value.adjustmentType) && !value.reason) {
    context.addIssue({
      code: "custom",
      path: ["reason"],
      message: "Enter a reason for this stock reduction.",
    });
  }
});

export const customerRequestSchema = z.object({
  businessId: selectedBusinessId,
  name: requiredText("Customer name"),
  phone: optionalText,
});

export const productUnitRequestSchema = z.object({
  businessId: selectedBusinessId,
  name: requiredText("Unit name", 80),
  singularLabel: requiredText("Singular label", 80),
  pluralLabel: requiredText("Plural label", 80),
  allowsDecimal: z.coerce.boolean().default(false),
});

export const productLookupSearchSchema = z.object({
  businessId: selectedBusinessId.optional(),
  barcode: optionalText,
  q: optionalText,
  categoryId: optionalText,
  brandId: optionalText,
});

export const posCheckoutRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  idempotencyKey: requiredText("Checkout id", 240),
  accountId: optionalText,
  customerId: optionalText,
  customerName: optionalText,
  customerPhone: optionalText,
  note: optionalText,
  orderDiscount: z.coerce.number().finite().nonnegative().default(0),
  createInvoice: z.coerce.boolean().default(false),
  items: z.array(
    z.object({
      inventoryItemId: requiredText("Product"),
      quantity: z.coerce.number().finite().positive(),
      discount: z.coerce.number().finite().nonnegative().default(0),
    }),
  ).min(1, "Add at least one product."),
  payments: z.array(paymentAllocationSchema).default([]),
}).superRefine((value, context) => {
  const paidTotal = value.payments
    .filter((payment) => payment.method !== "credit")
    .reduce((total, payment) => total + payment.amount, 0);

  if (value.payments.some((payment) => payment.method === "credit")) {
    context.addIssue({
      code: "custom",
      path: ["payments"],
      message: "Use customer will pay later instead of adding Credit as a payment line.",
    });
  }

  if (paidTotal <= 0 && !value.customerId && !value.customerName) {
    context.addIssue({
      code: "custom",
      path: ["customerName"],
      message: "Choose a customer when the sale is not paid now.",
    });
  }
});

export const onboardingProgressRequestSchema = z.object({
  businessId: selectedBusinessId.optional(),
  step: requiredText("Onboarding step", 80),
  eventName: optionalText,
  goal: optionalText,
  data: z.record(z.string(), z.unknown()).optional(),
  completed: z.coerce.boolean().default(false),
  skipped: z.coerce.boolean().default(false),
});

export const customerReturnRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  idempotencyKey: requiredText("Return id", 240),
  originalTransactionId: requiredText("Original sale"),
  reason: requiredText("Return reason"),
  disposition: returnDispositionSchema,
  outcome: customerReturnOutcomeSchema,
  accountId: optionalText,
  note: optionalLongText,
  items: z.array(
    z.object({
      inventoryItemId: requiredText("Product"),
      quantity: z.coerce.number().finite().positive(),
    }),
  ).min(1, "Select at least one returned item."),
});

export const supplierReturnRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  idempotencyKey: requiredText("Return id", 240),
  supplierId: optionalText,
  originalTransactionId: optionalText,
  reason: requiredText("Return reason"),
  settlement: supplierReturnSettlementSchema,
  accountId: optionalText,
  note: optionalLongText,
  items: z.array(
    z.object({
      inventoryItemId: requiredText("Product"),
      quantity: z.coerce.number().finite().positive(),
    }),
  ).min(1, "Select at least one returned item."),
});

const stockTransferItemSchema = z.object({
  inventoryItemId: requiredText("Product"),
  quantity: z.coerce.number().finite().positive("Enter a transfer quantity greater than zero."),
});

export const stockTransferCreateRequestSchema = z
  .object({
    businessId: selectedBusinessId,
    sourceLocationId: requiredText("Source location"),
    destinationLocationId: requiredText("Destination location"),
    reason: optionalText,
    reference: optionalText,
    idempotencyKey: optionalText,
    items: z.array(stockTransferItemSchema).min(1, "Add at least one product."),
  })
  .superRefine((value, context) => {
    if (value.sourceLocationId === value.destinationLocationId) {
      context.addIssue({
        code: "custom",
        path: ["destinationLocationId"],
        message: "Choose two different locations.",
      });
    }
  });

export const stockTransferActionRequestSchema = z.object({
  businessId: selectedBusinessId,
  note: optionalText,
});

export const stockTransferReceiveRequestSchema = z.object({
  businessId: selectedBusinessId,
  items: z
    .array(
      z.object({
        inventoryItemId: requiredText("Product"),
        receivedQuantity: z.coerce.number().finite().nonnegative().optional(),
        damagedQuantity: z.coerce.number().finite().nonnegative().default(0),
        note: optionalText,
      }),
    )
    .optional(),
});

export const reportExportJobRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  reportId: defaultText("sales_summary"),
  format: exportFormatSchema.default("csv"),
  period: z.enum(["day", "week", "month"]).default("month"),
  date: optionalText,
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export const taxSettingsRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  country: z.enum(["NG", "GH", "KE", "ZA", "UG", "TZ", "RW", "OTHER"]).default("NG"),
  registrationNumber: optionalText,
  enabled: z.coerce.boolean().default(false),
  inclusiveByDefault: z.coerce.boolean().default(false),
  disclaimer: optionalLongText,
  rates: z
    .array(
      z.object({
        id: optionalText,
        label: requiredText("Tax label", 80),
        rate: z.coerce.number().finite().min(0).max(100),
        type: taxRateTypeSchema.default("vat"),
        isDefault: z.coerce.boolean().default(false),
      }),
    )
    .default([]),
});

export const documentBrandingRequestSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  tradingName: optionalText,
  logoUrl: safeString(z.string().trim().max(500)).optional(),
  address: optionalText,
  phone: optionalText,
  email: optionalText,
  website: safeString(z.string().trim().max(240)).optional(),
  taxId: optionalText,
  registrationNumber: optionalText,
  bankDetails: optionalLongText,
  paymentInstructions: optionalLongText,
  footer: optionalText,
  terms: optionalLongText,
  accentColor: safeString(z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Use a hex color like #0B1F3A.")).default("#0B1F3A"),
  invoicePrefix: defaultText("INV"),
});

export const i18nPreferenceRequestSchema = z.object({
  businessId: selectedBusinessId.optional(),
  language: localeSchema,
  applyToBusiness: z.coerce.boolean().default(false),
});

export const permissionPolicyRequestSchema = z.object({
  businessId: selectedBusinessId,
  role: z.enum(["owner", "staff", "accountant"]),
  permissions: z.array(requiredText("Permission", 120)).default([]),
});

export const announcementRequestSchema = z.object({
  title: requiredText("Announcement title", 120),
  body: requiredText("Announcement body", 1_000),
  audience: defaultText("all"),
  priority: z.coerce.number().int().min(0).max(10).default(0),
  status: announcementStatusSchema.default("draft"),
  publishAt: optionalText,
  expiresAt: optionalText,
});

export const announcementReadRequestSchema = z.object({
  dismissed: z.coerce.boolean().default(false),
});

export const collectDebtRequestSchema = z.object({
  businessId: selectedBusinessId,
  accountId: requiredText("Account"),
  amount: z.coerce.number().finite().positive().optional(),
  idempotencyKey: optionalText,
});

export const settleSupplierDebtRequestSchema = z.object({
  businessId: selectedBusinessId,
  accountId: requiredText("Account"),
  amount: z.coerce.number().finite().positive().optional(),
  idempotencyKey: optionalText,
});

export const remindDebtRequestSchema = z.object({
  businessId: selectedBusinessId,
  channel: z.enum(["manual", "whatsapp", "sms"]).default("manual"),
  note: optionalText,
});

export const staffInvitationRequestSchema = z.object({
  businessId: selectedBusinessId,
  email: safeEmail("Enter a valid staff email."),
  role: z.enum(["staff", "accountant"]).default("staff"),
});

export const staffInvitationActionRequestSchema = z.object({
  businessId: selectedBusinessId,
});

export const categorizationRequestSchema = z.object({
  businessId: selectedBusinessId,
  description: requiredText("Description"),
  amount: z.coerce.number().finite().nonnegative().optional(),
  type: z.enum(["sale", "expense", "transfer"]).optional(),
});

export const receiptUploadRequestSchema = z.object({
  businessId: selectedBusinessId,
  fileName: requiredText("Receipt filename"),
  mimeType: optionalText,
  text: safeString(z.string().max(10_000)).default(""),
});

export const receiptConfigRequestSchema = z.object({
  businessId: selectedBusinessId,
  logoUrl: safeString(z.string().max(500)).optional(),
  address: safeString(z.string().max(240)).optional(),
  phone: safeString(z.string().max(80)).optional(),
  email: safeString(z.string().trim().max(120)).optional(),
  taxId: safeString(z.string().max(80)).optional(),
  footerMessage: safeString(z.string().max(240)).optional(),
  includePoweredBy: z.coerce.boolean().default(true),
  defaultPaperSize: z.enum(["58mm", "80mm", "pdf"]).default("80mm"),
});

export const billingCheckoutRequestSchema = z.object({
  businessId: selectedBusinessId,
  plan: z.enum(["starter", "growth", "pro"]).default("growth"),
});

export const restoreBackupRequestSchema = z.object({
  businessId: selectedBusinessId,
  backup: z
    .object({
      version: z.literal(1),
      exportedAt: safeString(),
      business: z.object({
        name: safeString(),
        accounts: z.array(z.unknown()).default([]),
        transactions: z.array(z.unknown()).default([]),
        customers: z.array(z.unknown()).default([]),
        suppliers: z.array(z.unknown()).default([]),
        debts: z.array(z.unknown()).default([]),
        items: z.array(z.unknown()).default([]),
      }),
    })
    .passthrough(),
});

export const monthYearSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const reportPeriodSearchSchema = z.object({
  businessId: selectedBusinessId,
  locationId: optionalText,
  period: z.enum(["day", "week", "month"]).default("month"),
  date: optionalText,
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const body = await request.json().catch(() => undefined);
  if (body === undefined) {
    logMalformedPayload({ request, reason: "invalid_json" });
  } else if (hasNullishValue(body)) {
    logMalformedPayload({ request, reason: "nullish_values", body });
  }

  const sanitizedBody = sanitizePayload(body);
  const result = schema.safeParse(sanitizedBody);

  if (!result.success) {
    logMalformedPayload({ request, reason: "validation_failed", body: sanitizedBody });
    throw new RequestValidationError(toFriendlyValidationMessage(result.error));
  }

  return result.data;
}

export function toFriendlyValidationMessage(error: z.ZodError) {
  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return "Check your entry and try again.";
  }

  if (firstIssue.message && firstIssue.message !== "Invalid input") {
    return firstIssue.message;
  }

  const field = firstIssue.path.at(-1);
  return field ? `Check ${String(field)} and try again.` : "Check your entry and try again.";
}

export function parseMonthYear(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const result = monthYearSearchSchema.safeParse({
    month: url.searchParams.get("month") ?? now.getUTCMonth() + 1,
    year: url.searchParams.get("year") ?? now.getUTCFullYear(),
  });

  if (!result.success) {
    throw new RequestValidationError(result.error.issues[0]?.message ?? "Choose a valid period.");
  }

  return result.data;
}

export function parseReportPeriod(request: Request) {
  const url = new URL(request.url);
  const now = new Date();
  const result = reportPeriodSearchSchema.safeParse({
    businessId: url.searchParams.get("businessId") ?? undefined,
    locationId: url.searchParams.get("locationId") ?? undefined,
    period: url.searchParams.get("period") ?? "month",
    date: url.searchParams.get("date") ?? undefined,
    month: url.searchParams.get("month") ?? undefined,
    year: url.searchParams.get("year") ?? undefined,
  });

  if (!result.success) {
    throw new RequestValidationError(result.error.issues[0]?.message ?? "Choose a valid period.");
  }

  const period = result.data.period;
  const date = result.data.date ? new Date(result.data.date) : now;

  if (Number.isNaN(date.getTime())) {
    throw new RequestValidationError("Choose a valid report date.");
  }

  const month = result.data.month ?? date.getUTCMonth() + 1;
  const year = result.data.year ?? date.getUTCFullYear();

  return {
    businessId: result.data.businessId,
    locationId: result.data.locationId,
    period,
    date,
    month,
    year,
  };
}
