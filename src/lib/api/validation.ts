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
    type: z.enum(["sale", "expense"]),
    amount: z.coerce.number().finite().positive("Enter an amount greater than zero."),
    accountId: requiredText("Account"),
    description: optionalText.default("Activity"),
    category: optionalText,
    paymentStatus: z.enum(["paid", "credit", "unpaid"]),
    partyName: optionalText,
    costOfGoods: z.coerce.number().finite().nonnegative().optional(),
    occurredAt: optionalText,
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
  idempotencyKey: optionalText,
});

export const monthYearSearchSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
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
