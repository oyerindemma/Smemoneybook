import { Prisma, TaxRateType } from "@prisma/client";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

type TaxSettingsInput = {
  businessId: string;
  locationId?: string;
  country: string;
  registrationNumber?: string;
  enabled: boolean;
  inclusiveByDefault: boolean;
  disclaimer?: string;
  rates: Array<{
    label: string;
    rate: number;
    type: "vat" | "zero_rated" | "exempt" | "custom";
    isDefault: boolean;
  }>;
};

export async function getTaxSettingsForUser(userId: string, businessId: string) {
  const access = await requireBusinessAccess(userId, "reports:write", businessId);
  const [config, rates] = await Promise.all([
    getPrisma().taxConfig.findUnique({ where: { businessId: access.businessId } }),
    getPrisma().taxRate.findMany({
      where: { businessId: access.businessId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);

  return {
    config: config
      ? {
          country: config.country,
          registrationNumber: config.registrationNumber ?? undefined,
          enabled: config.enabled,
          inclusiveByDefault: config.inclusiveByDefault,
          disclaimer: config.disclaimer ?? undefined,
          locationId: config.locationId ?? undefined,
        }
      : undefined,
    rates: rates.map((rate) => ({
      id: rate.id,
      label: rate.label,
      rate: rate.rate.toNumber(),
      type: rate.type.toLowerCase(),
      isDefault: rate.isDefault,
    })),
  };
}

export async function saveTaxSettingsForUser(userId: string, input: TaxSettingsInput) {
  const access = await requireBusinessAccess(userId, "admin", input.businessId);

  await getPrisma().$transaction(async (tx) => {
    await tx.taxConfig.upsert({
      where: { businessId: access.businessId },
      create: {
        businessId: access.businessId,
        locationId: input.locationId || null,
        country: input.country,
        registrationNumber: input.registrationNumber || null,
        enabled: input.enabled,
        inclusiveByDefault: input.inclusiveByDefault,
        disclaimer: input.disclaimer || null,
      },
      update: {
        locationId: input.locationId || null,
        country: input.country,
        registrationNumber: input.registrationNumber || null,
        enabled: input.enabled,
        inclusiveByDefault: input.inclusiveByDefault,
        disclaimer: input.disclaimer || null,
      },
    });

    await tx.taxRate.updateMany({
      where: { businessId: access.businessId },
      data: { archivedAt: new Date(), isDefault: false },
    });

    for (const rate of input.rates) {
      await tx.taxRate.upsert({
        where: {
          businessId_label: {
            businessId: access.businessId,
            label: rate.label,
          },
        },
        create: {
          businessId: access.businessId,
          locationId: input.locationId || null,
          label: rate.label,
          rate: new Prisma.Decimal(rate.rate),
          type: toDbTaxRateType(rate.type),
          isDefault: rate.isDefault,
        },
        update: {
          locationId: input.locationId || null,
          rate: new Prisma.Decimal(rate.rate),
          type: toDbTaxRateType(rate.type),
          isDefault: rate.isDefault,
          archivedAt: null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: userId,
        action: "tax.settings_saved",
        message: "Tax settings were saved.",
        metadata: { enabled: input.enabled, rateCount: input.rates.length },
      },
    });
  });

  return getTaxSettingsForUser(userId, access.businessId);
}

function toDbTaxRateType(value: TaxSettingsInput["rates"][number]["type"]) {
  if (value === "zero_rated") {
    return TaxRateType.ZERO_RATED;
  }

  return value.toUpperCase() as TaxRateType;
}
