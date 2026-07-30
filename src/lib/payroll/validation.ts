import { z } from "zod";

export const payrollBusinessIdSchema = z.preprocess(
  (value) => value ?? "",
  z.string().trim().min(1, "Choose a business."),
);

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().optional(),
).optional();

export const payrollComponentSchema = z.object({
  name: z.string().trim().min(2, "Enter component name.").max(80),
  type: z.enum(["allowance", "deduction", "employer_contribution"]),
  calculationMethod: z.enum(["fixed_amount", "percentage_of_base", "manual"]).default("fixed_amount"),
  amount: z.coerce.number().nonnegative().optional(),
  rate: z.coerce.number().nonnegative().optional(),
  taxable: z.coerce.boolean().default(false),
  pensionable: z.coerce.boolean().default(false),
  statutory: z.coerce.boolean().default(false),
});

export const employeeCreateSchema = z.object({
  businessId: payrollBusinessIdSchema,
  locationId: optionalText,
  staffMembershipId: optionalText,
  employeeNumber: optionalText,
  displayName: z.string().trim().min(2, "Enter employee name.").max(120),
  fullName: optionalText,
  roleTitle: optionalText,
  jobTitle: optionalText,
  email: optionalText,
  phone: optionalText,
  baseSalary: z.coerce.number().nonnegative(),
  payFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).default("MONTHLY"),
  country: z.string().trim().default("NG"),
  currency: z.string().trim().default("NGN"),
  employeeCode: optionalText,
  paymentMethod: z.enum(["manual", "cash", "bank_transfer", "cheque", "mobile_money", "other"]).default("manual"),
  bankAccount: optionalText,
  pensionNumber: optionalText,
  taxId: optionalText,
  startDate: z.coerce.date().optional(),
  components: z.array(payrollComponentSchema).default([]),
});

export const employeeUpdateSchema = employeeCreateSchema.partial().extend({
  businessId: payrollBusinessIdSchema,
  employmentStatus: z.enum(["active", "inactive", "terminated", "on_leave"]).optional(),
  endDate: z.coerce.date().optional(),
  effectiveFrom: z.coerce.date().optional(),
});

export const periodCreateSchema = z.object({
  businessId: payrollBusinessIdSchema,
  locationId: optionalText,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  payDate: z.coerce.date(),
  country: z.string().trim().default("NG"),
  requiresDualApproval: z.coerce.boolean().default(false),
});

export const periodActionSchema = z.object({
  businessId: payrollBusinessIdSchema,
});

export const periodRejectSchema = periodActionSchema.extend({
  reason: z.string().trim().min(5, "Enter a rejection reason."),
});

export const periodReverseSchema = periodActionSchema.extend({
  reason: z.string().trim().min(10, "Enter the reversal reason."),
});
