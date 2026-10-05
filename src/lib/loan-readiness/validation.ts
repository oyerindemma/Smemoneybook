import { z } from "zod";
import {
  loanReadinessDocumentLabels,
  loanReadinessDocumentTypes,
} from "@/lib/loan-readiness/definitions";

const optionalText = (label: string, max: number) =>
  z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max, `${label} is too long.`).optional(),
  ).optional();

const optionalDate = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.iso.datetime({ offset: true }).optional(),
).optional();

export const loanReadinessGenerateSchema = z.object({
  businessId: z.string().trim().min(1, "Choose a business."),
  locationId: optionalText("Location", 120),
  recalculatedFromId: optionalText("Earlier assessment", 120),
});

const documentSchema = z.object({
  documentType: z.enum(loanReadinessDocumentTypes),
  label: z.string().trim().min(2, "Enter a document label.").max(100, "Document label is too long."),
  status: z.enum(["MISSING", "AVAILABLE", "NEEDS_UPDATE"]),
  reference: optionalText("Document reference", 240),
  issuedAt: optionalDate,
  expiresAt: optionalDate,
  notes: optionalText("Document notes", 500),
}).superRefine((document, context) => {
  if (document.status === "AVAILABLE" && !document.reference) {
    context.addIssue({
      code: "custom",
      path: ["reference"],
      message: "Add a non-sensitive reference for an available document.",
    });
  }
});

export const loanReadinessProfileSchema = z.object({
  businessId: z.string().trim().min(1, "Choose a business."),
  industry: optionalText("Industry", 120),
  operatingStartDate: optionalDate,
  fundingPurpose: optionalText("Funding purpose", 300),
  requestedAmount: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.coerce.number().positive("Requested amount must be greater than zero.").max(1_000_000_000_000).optional(),
  ).optional(),
  preferredCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  consentToShare: z.boolean().default(false),
  documents: z.array(documentSchema).max(loanReadinessDocumentTypes.length).default(
    loanReadinessDocumentTypes.map((documentType) => ({
      documentType,
      label: loanReadinessDocumentLabels[documentType],
      status: "MISSING" as const,
    })),
  ),
}).superRefine((profile, context) => {
  if (profile.operatingStartDate && new Date(profile.operatingStartDate) > new Date()) {
    context.addIssue({
      code: "custom",
      path: ["operatingStartDate"],
      message: "Operating start date cannot be in the future.",
    });
  }

  const uniqueTypes = new Set(profile.documents.map((document) => document.documentType));
  if (uniqueTypes.size !== profile.documents.length) {
    context.addIssue({ code: "custom", path: ["documents"], message: "Each document type can appear once." });
  }
});
