import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { normalizeNigerianPhoneNumber } from "@/lib/whatsapp/formatter";
import {
  evaluateWhatsAppAutomationQueue,
  summarizeWhatsAppAutomationHealth,
} from "@/lib/phase3/whatsapp-automation";

export type WhatsAppAutomationDashboard = {
  preferences: {
    whatsappAutomationEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    timezone: string;
  };
  contacts: Array<{
    id: string;
    phone: string;
    name: string | null;
    consentStatus: string;
    consentedAt: string | null;
    optedOutAt: string | null;
  }>;
  templates: Array<{
    id: string;
    templateName: string;
    category: string;
    languageCode: string;
    status: string;
    approvedAt: string | null;
  }>;
  recentJobs: Array<{
    id: string;
    phone: string;
    automationType: string;
    templateName: string | null;
    status: string;
    scheduledFor: string;
    costKobo: number;
    retryCount: number;
  }>;
  health: ReturnType<typeof summarizeWhatsAppAutomationHealth>;
};

export async function listWhatsAppAutomationDashboard({
  businessId,
}: {
  businessId: string;
}): Promise<WhatsAppAutomationDashboard> {
  const [preferences, contacts, templates, jobs] = await Promise.all([
    getPrisma().automationPreference.upsert({
      where: { businessId },
      create: { businessId },
      update: {},
    }),
    getPrisma().whatsAppAutomationContact.findMany({
      where: { businessId },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    getPrisma().whatsAppAutomationTemplate.findMany({
      where: {
        OR: [{ businessId }, { businessId: null }],
      },
      orderBy: [{ status: "asc" }, { templateName: "asc" }],
      take: 100,
    }),
    getPrisma().whatsAppAutomationJob.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  return {
    preferences: {
      whatsappAutomationEnabled: preferences.whatsappAutomationEnabled,
      quietHoursStart: preferences.quietHoursStart,
      quietHoursEnd: preferences.quietHoursEnd,
      timezone: preferences.timezone,
    },
    contacts: contacts.map((contact) => ({
      id: contact.id,
      phone: contact.phone,
      name: contact.name,
      consentStatus: contact.consentStatus,
      consentedAt: contact.consentedAt?.toISOString() ?? null,
      optedOutAt: contact.optedOutAt?.toISOString() ?? null,
    })),
    templates: templates.map((template) => ({
      id: template.id,
      templateName: template.templateName,
      category: template.category,
      languageCode: template.languageCode,
      status: template.status,
      approvedAt: template.approvedAt?.toISOString() ?? null,
    })),
    recentJobs: jobs.map((job) => ({
      id: job.id,
      phone: job.phone,
      automationType: job.automationType,
      templateName: job.templateName,
      status: job.status,
      scheduledFor: job.scheduledFor.toISOString(),
      costKobo: job.costKobo,
      retryCount: job.retryCount,
    })),
    health: summarizeWhatsAppAutomationHealth(jobs),
  };
}

export async function upsertWhatsAppAutomationContact({
  businessId,
  phone,
  name,
  consentStatus,
  consentSource,
  tags = [],
  metadata,
}: {
  businessId: string;
  phone: string;
  name?: string;
  consentStatus: "PENDING" | "OPTED_IN" | "OPTED_OUT";
  consentSource?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}) {
  const normalizedPhone = normalizeNigerianPhoneNumber(phone);
  const now = new Date();

  return getPrisma().whatsAppAutomationContact.upsert({
    where: {
      businessId_phone: {
        businessId,
        phone: normalizedPhone,
      },
    },
    create: {
      businessId,
      phone: normalizedPhone,
      name,
      consentStatus,
      consentSource,
      consentedAt: consentStatus === "OPTED_IN" ? now : undefined,
      optedOutAt: consentStatus === "OPTED_OUT" ? now : undefined,
      tags,
      metadata: metadata ? toJson(metadata) : undefined,
    },
    update: {
      name,
      consentStatus,
      consentSource,
      consentedAt: consentStatus === "OPTED_IN" ? now : undefined,
      optedOutAt: consentStatus === "OPTED_OUT" ? now : null,
      tags,
      metadata: metadata ? toJson(metadata) : undefined,
    },
  });
}

export async function upsertWhatsAppAutomationTemplate({
  businessId,
  templateName,
  category,
  languageCode = "en",
  status,
  rejectedReason,
  metadata,
}: {
  businessId: string;
  templateName: string;
  category: string;
  languageCode?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";
  rejectedReason?: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();

  return getPrisma().whatsAppAutomationTemplate.upsert({
    where: {
      businessId_templateName_languageCode: {
        businessId,
        templateName,
        languageCode,
      },
    },
    create: {
      businessId,
      templateName,
      category,
      languageCode,
      status,
      rejectedReason,
      approvedAt: status === "APPROVED" ? now : undefined,
      lastSyncedAt: now,
      metadata: metadata ? toJson(metadata) : undefined,
    },
    update: {
      category,
      status,
      rejectedReason,
      approvedAt: status === "APPROVED" ? now : null,
      lastSyncedAt: now,
      metadata: metadata ? toJson(metadata) : undefined,
    },
  });
}

export async function queueWhatsAppAutomationJob({
  businessId,
  phone,
  automationType,
  templateName,
  messagePreview,
  languageCode = "en",
  scheduledFor = new Date(),
  costKobo = 0,
  actorId,
  metadata,
}: {
  businessId: string;
  phone: string;
  automationType: string;
  templateName?: string;
  messagePreview: string;
  languageCode?: string;
  scheduledFor?: Date;
  costKobo?: number;
  actorId?: string;
  metadata?: Record<string, unknown>;
}) {
  const normalizedPhone = normalizeNigerianPhoneNumber(phone);
  const [preferences, contact, template] = await Promise.all([
    getPrisma().automationPreference.upsert({
      where: { businessId },
      create: { businessId },
      update: {},
    }),
    getPrisma().whatsAppAutomationContact.findUnique({
      where: {
        businessId_phone: {
          businessId,
          phone: normalizedPhone,
        },
      },
    }),
    templateName
      ? getPrisma().whatsAppAutomationTemplate.findFirst({
          where: {
            templateName,
            languageCode,
            OR: [{ businessId }, { businessId: null }],
          },
          orderBy: { businessId: "desc" },
        })
      : Promise.resolve(null),
  ]);
  const decision = evaluateWhatsAppAutomationQueue({
    contact,
    template,
    preferences,
    now: scheduledFor,
  });

  return getPrisma().whatsAppAutomationJob.create({
    data: {
      businessId,
      contactId: contact?.id,
      phone: normalizedPhone,
      automationType,
      templateName,
      messagePreview: messagePreview.slice(0, 500),
      status: decision.status,
      scheduledFor,
      skippedAt: decision.allowed ? undefined : scheduledFor,
      costKobo: decision.allowed ? costKobo : 0,
      quietHoursSkipped: decision.quietHoursSkipped,
      optOutCheckedAt: new Date(decision.optOutCheckedAt),
      metadata: toJson({
        ...metadata,
        policyVersion: decision.policyVersion,
        decisionReason: decision.reason,
      }),
      createdById: actorId,
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
