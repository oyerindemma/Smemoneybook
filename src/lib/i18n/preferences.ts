import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const supportedLocales = ["en", "fr", "sw", "ha", "yo", "ig"] as const;

export async function getLanguagePreference(userId: string, businessId?: string) {
  const user = await getPrisma().user.findUniqueOrThrow({
    where: { id: userId },
    select: { language: true },
  });
  const business = businessId
    ? await requireBusinessAccess(userId, undefined, businessId).then((access) =>
        getPrisma().business.findUnique({
          where: { id: access.businessId },
          select: { defaultLanguage: true },
        }),
      )
    : null;

  return {
    language: user.language,
    businessLanguage: business?.defaultLanguage,
    supportedLocales,
  };
}

export async function saveLanguagePreference({
  userId,
  businessId,
  language,
  applyToBusiness,
}: {
  userId: string;
  businessId?: string;
  language: string;
  applyToBusiness: boolean;
}) {
  await getPrisma().user.update({
    where: { id: userId },
    data: { language },
  });

  if (applyToBusiness && businessId) {
    const access = await requireBusinessAccess(userId, "admin", businessId);
    await getPrisma().business.update({
      where: { id: access.businessId },
      data: { defaultLanguage: language },
    });
  }

  return getLanguagePreference(userId, businessId);
}
