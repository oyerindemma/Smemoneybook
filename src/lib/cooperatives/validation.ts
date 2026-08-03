import { z } from "zod";

export const cooperativesBusinessIdSchema = z.preprocess(
  (value) => value ?? "",
  z.string().trim().min(1, "Choose a business."),
);

export const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : undefined),
  z.string().optional(),
).optional();

export const positiveMoney = z.coerce.number().positive();

export const groupCreateSchema = z.object({
  businessId: cooperativesBusinessIdSchema,
  locationId: optionalText,
  name: z.string().trim().min(2, "Enter the cooperative name.").max(120),
  description: optionalText,
  registrationReference: optionalText,
  currency: z.string().trim().default("NGN"),
  contributionAmount: z.coerce.number().nonnegative().optional(),
  contributionFrequency: z.string().trim().default("MONTHLY"),
  requireGuarantors: z.coerce.boolean().default(false),
  minimumGuarantors: z.coerce.number().int().nonnegative().default(0),
});

export const groupUpdateSchema = groupCreateSchema.partial().extend({
  businessId: cooperativesBusinessIdSchema,
});

export const memberCreateSchema = z.object({
  businessId: cooperativesBusinessIdSchema,
  memberNumber: optionalText,
  displayName: z.string().trim().min(2, "Enter the member name.").max(120),
  fullName: optionalText,
  phone: optionalText,
  email: optionalText,
  externalReference: optionalText,
});

export const contributionPlanCreateSchema = z.object({
  businessId: cooperativesBusinessIdSchema,
  name: z.string().trim().min(2, "Enter the contribution plan name.").max(120),
  amount: positiveMoney,
  frequency: z.string().trim().default("MONTHLY"),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  graceDays: z.coerce.number().int().nonnegative().default(0),
  penaltyAmount: z.coerce.number().nonnegative().default(0),
  mandatory: z.coerce.boolean().default(true),
});

export const contributionRecordSchema = z.object({
  businessId: cooperativesBusinessIdSchema,
  memberId: z.string().trim().min(1, "Choose a member."),
  planId: optionalText,
  amount: positiveMoney,
  penaltyAmount: z.coerce.number().nonnegative().default(0),
  dueDate: z.coerce.date().optional(),
  paidAt: z.coerce.date().optional(),
  reference: optionalText,
  paymentReference: optionalText,
  idempotencyKey: optionalText,
});

export const contributionReverseSchema = z.object({
  businessId: cooperativesBusinessIdSchema,
  reason: z.string().trim().min(5, "Enter a reversal reason."),
});

export const loanRequestSchema = z.object({
  businessId: cooperativesBusinessIdSchema,
  memberId: z.string().trim().min(1, "Choose a member."),
  principal: positiveMoney,
  interestRate: z.coerce.number().nonnegative().default(0),
  interestMethod: z.enum(["zero", "flat", "reducing_balance"]).default("zero"),
  penaltyAmount: z.coerce.number().nonnegative().default(0),
  termCount: z.coerce.number().int().positive().default(1),
  repaymentFrequency: z.string().trim().default("MONTHLY"),
  purpose: optionalText,
  dueAt: z.coerce.date().optional(),
  guarantorMemberIds: z.array(z.string().trim().min(1)).default([]),
  idempotencyKey: optionalText,
});

export const loanActionSchema = z.object({
  businessId: cooperativesBusinessIdSchema,
});

export const loanApproveSchema = loanActionSchema.extend({
  approvedAmount: z.coerce.number().positive().optional(),
});

export const loanRejectSchema = loanActionSchema.extend({
  reason: z.string().trim().min(5, "Enter a rejection reason."),
});

export const loanDisbursementSchema = loanActionSchema.extend({
  amount: z.coerce.number().positive().optional(),
  disbursedAt: z.coerce.date().optional(),
  reference: optionalText,
});

export const loanRepaymentSchema = loanActionSchema.extend({
  scheduleId: optionalText,
  amount: positiveMoney,
  principalPortion: z.coerce.number().nonnegative().optional(),
  interestPortion: z.coerce.number().nonnegative().optional(),
  penaltyPortion: z.coerce.number().nonnegative().optional(),
  paidAt: z.coerce.date().optional(),
  reference: optionalText,
  paymentReference: optionalText,
  idempotencyKey: optionalText,
});

export const ledgerTransferSchema = loanActionSchema.extend({
  direction: z.enum(["business_to_cooperative", "cooperative_to_business"]),
  amount: positiveMoney,
  currency: z.string().trim().default("NGN"),
  memo: optionalText,
  reference: optionalText,
  accountId: optionalText,
});
