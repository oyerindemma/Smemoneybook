import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

type DocumentBrandingInput = {
  businessId: string;
  locationId?: string;
  tradingName?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxId?: string;
  registrationNumber?: string;
  bankDetails?: string;
  paymentInstructions?: string;
  footer?: string;
  terms?: string;
  accentColor: string;
  invoicePrefix: string;
};

export async function getDocumentBrandingForUser(userId: string, businessId: string) {
  const access = await requireBusinessAccess(userId, "admin", businessId);
  const branding = await getPrisma().documentBrandingConfig.findUnique({
    where: { businessId: access.businessId },
  });

  return branding
    ? {
        tradingName: branding.tradingName ?? undefined,
        logoUrl: branding.logoUrl ?? undefined,
        address: branding.address ?? undefined,
        phone: branding.phone ?? undefined,
        email: branding.email ?? undefined,
        website: branding.website ?? undefined,
        taxId: branding.taxId ?? undefined,
        registrationNumber: branding.registrationNumber ?? undefined,
        bankDetails: branding.bankDetails ?? undefined,
        paymentInstructions: branding.paymentInstructions ?? undefined,
        footer: branding.footer ?? undefined,
        terms: branding.terms ?? undefined,
        accentColor: branding.accentColor,
        invoicePrefix: branding.invoicePrefix,
      }
    : null;
}

export async function saveDocumentBrandingForUser(userId: string, input: DocumentBrandingInput) {
  const access = await requireBusinessAccess(userId, "admin", input.businessId);

  const branding = await getPrisma().documentBrandingConfig.upsert({
    where: { businessId: access.businessId },
    create: {
      businessId: access.businessId,
      ...normalizeBrandingInput(input),
    },
    update: normalizeBrandingInput(input),
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: userId,
      action: "document_branding.saved",
      message: "Document branding settings were saved.",
    },
  });

  return branding;
}

function normalizeBrandingInput(input: DocumentBrandingInput) {
  return {
    locationId: input.locationId || null,
    tradingName: input.tradingName || null,
    logoUrl: input.logoUrl || null,
    address: input.address || null,
    phone: input.phone || null,
    email: input.email || null,
    website: input.website || null,
    taxId: input.taxId || null,
    registrationNumber: input.registrationNumber || null,
    bankDetails: input.bankDetails || null,
    paymentInstructions: input.paymentInstructions || null,
    footer: input.footer || null,
    terms: input.terms || null,
    accentColor: input.accentColor || "#0B1F3A",
    invoicePrefix: input.invoicePrefix || "INV",
  };
}
