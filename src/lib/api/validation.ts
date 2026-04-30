import { z } from "zod";

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

const optionalText = z
  .string()
  .trim()
  .max(240)
  .optional()
  .transform((value) => value || undefined);

const requiredText = (label: string, max = 120) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} is too long.`);

export const registerRequestSchema = z.object({
  name: requiredText("Your name"),
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z.string().min(8, "Enter an 8+ character password."),
  businessName: requiredText("Business name"),
});

export const loginRequestSchema = z.object({
  email: z.email("Enter a valid email.").trim().toLowerCase(),
  password: z.string().min(1, "Enter your password."),
});

export const businessRequestSchema = z.object({
  name: requiredText("Business name"),
});

export const transactionRequestSchema = z
  .object({
    idempotencyKey: optionalText,
    businessId: optionalText,
    type: z.enum(["sale", "expense", "transfer"]),
    amount: z.coerce.number().finite().positive("Enter an amount greater than zero."),
    accountId: requiredText("Account"),
    destinationAccountId: optionalText,
    description: optionalText.default("Activity"),
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
  businessId: optionalText,
  captures: z.array(
    z.object({
      clientId: requiredText("Offline entry id"),
      transaction: transactionRequestSchema,
    }),
  ).min(1, "Add at least one offline entry."),
});

export const accountRequestSchema = z.object({
  name: requiredText("Account name"),
  type: z.enum(["cash", "bank", "pos", "mobile_money"]),
  openingBalance: z.coerce.number().finite().nonnegative().default(0),
});

export const reversalRequestSchema = z.object({
  reason: optionalText,
});

export const inventoryItemRequestSchema = z.object({
  name: requiredText("Product name"),
  sku: optionalText,
  sellingPrice: z.coerce.number().finite().nonnegative(),
  costPrice: z.coerce.number().finite().nonnegative(),
  quantityOnHand: z.coerce.number().int().nonnegative().default(0),
  lowStockLevel: z.coerce.number().int().nonnegative().default(5),
});

export const inventoryMovementRequestSchema = z.object({
  quantity: z.coerce.number().int().positive("Enter a stock quantity greater than zero."),
  note: optionalText,
});

export const collectDebtRequestSchema = z.object({
  accountId: requiredText("Account"),
  amount: z.coerce.number().finite().positive().optional(),
  idempotencyKey: optionalText,
});

export const settleSupplierDebtRequestSchema = z.object({
  accountId: requiredText("Account"),
  amount: z.coerce.number().finite().positive().optional(),
  idempotencyKey: optionalText,
});

export const remindDebtRequestSchema = z.object({
  channel: z.enum(["manual", "whatsapp", "sms"]).default("manual"),
  note: optionalText,
});

export const staffInvitationRequestSchema = z.object({
  email: z.email("Enter a valid staff email.").trim().toLowerCase(),
  role: z.enum(["staff", "accountant"]).default("staff"),
});

export const categorizationRequestSchema = z.object({
  description: requiredText("Description"),
  amount: z.coerce.number().finite().nonnegative().optional(),
  type: z.enum(["sale", "expense", "transfer"]).optional(),
});

export const receiptUploadRequestSchema = z.object({
  businessId: optionalText,
  fileName: requiredText("Receipt filename"),
  mimeType: optionalText,
  text: z.string().max(10_000).optional().default(""),
});

export const billingCheckoutRequestSchema = z.object({
  businessId: optionalText,
  plan: z.enum(["starter", "growth", "pro"]).default("growth"),
});

export const restoreBackupRequestSchema = z.object({
  backup: z
    .object({
      version: z.literal(1),
      exportedAt: z.string(),
      business: z.object({
        name: z.string(),
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
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new RequestValidationError(result.error.issues[0]?.message ?? "Check your entry.");
  }

  return result.data;
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

  return { period, date, month, year };
}
