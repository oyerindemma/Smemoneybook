import { AnnouncementStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

type AnnouncementInput = {
  title: string;
  body: string;
  audience: string;
  priority: number;
  status: "draft" | "published" | "archived";
  publishAt?: string;
  expiresAt?: string;
};

export async function listAnnouncementsForUser(userId: string) {
  const now = new Date();
  const announcements = await getPrisma().announcement.findMany({
    where: {
      status: AnnouncementStatus.PUBLISHED,
      OR: [{ publishAt: null }, { publishAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      reads: {
        none: {
          userId,
          dismissedAt: { not: null },
        },
      },
    },
    orderBy: [{ priority: "desc" }, { publishAt: "desc" }, { createdAt: "desc" }],
    take: 10,
    include: { reads: { where: { userId } } },
  });

  return announcements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    audience: announcement.audience,
    priority: announcement.priority,
    readAt: announcement.reads[0]?.readAt?.toISOString(),
    dismissedAt: announcement.reads[0]?.dismissedAt?.toISOString(),
  }));
}

export async function createAnnouncementForAdmin(userId: string, input: AnnouncementInput) {
  const announcement = await getPrisma().announcement.create({
    data: {
      title: input.title,
      body: input.body,
      audience: input.audience,
      priority: input.priority,
      status: input.status.toUpperCase() as AnnouncementStatus,
      publishAt: input.publishAt ? new Date(input.publishAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdById: userId,
    },
  });

  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    status: announcement.status.toLowerCase(),
  };
}

export async function markAnnouncementForUser({
  userId,
  announcementId,
  dismissed,
}: {
  userId: string;
  announcementId: string;
  dismissed: boolean;
}) {
  const now = new Date();
  return getPrisma().announcementRead.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: {
      announcementId,
      userId,
      readAt: now,
      dismissedAt: dismissed ? now : null,
    },
    update: {
      readAt: now,
      dismissedAt: dismissed ? now : undefined,
    },
  });
}
