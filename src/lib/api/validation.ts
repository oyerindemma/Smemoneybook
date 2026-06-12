import { z } from "zod";
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

export const registerRequestSchema = z.object({
  name: requiredText("Your name"),
  email: safeEmail("Enter a valid email."),
  password: safeString(z.string().min(12, "Enter a 12+ character password.")),
  businessName: optionalText,
  referralCode: optionalText,
});

export const loginRequestSchema = z.object({
  email: safeEmail("Enter a valid email."),
  password: safeString(z.string().min(1, "Enter your password.")),
});

export const passwordResetRequestSchema = z.object({
  email: safeEmail("Enter a valid email."),
});

export const passwordResetConfirmSchema = z.object({
  token: requiredText("Reset link", 240),
  password: safeString(z.string().min(12, "Enter a 12+ character password.")),
});

export const businessRequestSchema = z.object({
  name: requiredText("Business name"),
});

export const onboardingSetupRequestSchema = z.object({
  businessName: requiredText("Business name"),
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
});

export const transactionRequestSchema = z
  .object({
    idempotencyKey: optionalText,
    businessId: selectedBusinessId,
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
    inventoryQuantity: z.coerce.number().int().positive().optional(),
    costOfGoods: z.coerce.number().finite().nonnegative().optional(),
    occurredAt: optionalText,
    dueAt: optionalText,
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
  name: requiredText("Product name"),
  sku: optionalText,
  sellingPrice: z.coerce.number().finite().nonnegative(),
  costPrice: z.coerce.number().finite().nonnegative(),
  quantityOnHand: z.coerce.number().int().nonnegative().default(0),
  lowStockLevel: z.coerce.number().int().nonnegative().default(5),
});

export const inventoryMovementRequestSchema = z.object({
  businessId: selectedBusinessId,
  quantity: z.coerce.number().int().positive("Enter a stock quantity greater than zero."),
  note: optionalText,
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

  return { businessId: result.data.businessId, period, date, month, year };
}
