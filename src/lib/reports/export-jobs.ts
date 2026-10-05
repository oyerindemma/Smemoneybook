import { ExportJobStatus, Prisma } from "@prisma/client";
import { getMonthlyReport } from "@/lib/bookkeeping/persistence";
import { requireBusinessAccess, requireLocationAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";
import { advancedReportToCsv, advancedReportToPdf } from "@/lib/reports/advanced-renderer";
import { findReportDefinition } from "@/lib/reports/definitions";

type ReportExportJobInput = {
  businessId: string;
  locationId?: string;
  reportId: string;
  format: "csv" | "pdf";
  period: "day" | "week" | "month";
  date?: string;
  month?: number;
  year?: number;
};

export async function listReportExportJobsForUser(userId: string, businessId: string) {
  const access = await requireBusinessAccess(userId, "reports:write", businessId);
  const jobs = await getPrisma().exportJob.findMany({
    where: { businessId: access.businessId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return jobs.map(mapExportJob);
}

export async function createReportExportJobForUser(userId: string, input: ReportExportJobInput) {
  const access = await requireBusinessAccess(userId, "reports:write", input.businessId);
  const definition = findReportDefinition(input.reportId);

  if (!definition) {
    throw new Error("Choose a valid report.");
  }

  if (input.locationId) {
    await requireLocationAccess({
      userId,
      businessId: access.businessId,
      locationId: input.locationId,
      permission: definition.requiredPermission,
    });
  }

  const now = new Date();
  const date = input.date ? new Date(input.date) : now;
  const report = await getMonthlyReport({
    businessId: access.businessId,
    locationId: input.locationId,
    period: input.period,
    date,
    month: input.month ?? date.getUTCMonth() + 1,
    year: input.year ?? date.getUTCFullYear(),
  });
  const fileName = `moneybook-${definition.id}-${report.period}-${report.periodLabel}.${input.format}`;
  const content =
    input.format === "pdf"
      ? advancedReportToPdf(definition, report).toString("base64")
      : advancedReportToCsv(definition, report);

  const job = await getPrisma().exportJob.create({
    data: {
      businessId: access.businessId,
      actorId: userId,
      locationId: input.locationId,
      type: definition.id,
      format: input.format,
      status: ExportJobStatus.COMPLETED,
      payload: {
        reportId: definition.id,
        period: input.period,
        date: input.date,
        month: input.month,
        year: input.year,
        fileName,
        contentEncoding: input.format === "pdf" ? "base64" : "utf8",
        preview: input.format === "pdf" ? undefined : content.slice(0, 2_000),
      } as Prisma.InputJsonObject,
      fileKey: fileName,
      downloadUrl: `/api/reports/monthly/export?${new URLSearchParams({
        businessId: access.businessId,
        ...(input.locationId ? { locationId: input.locationId } : {}),
        period: input.period,
        ...(input.date ? { date: input.date } : {}),
        ...(input.month ? { month: String(input.month) } : {}),
        ...(input.year ? { year: String(input.year) } : {}),
        format: input.format,
      }).toString()}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await getPrisma().auditLog.create({
    data: {
      businessId: access.businessId,
      actorId: userId,
      action: "report.generated",
      message: `${definition.name} export generated.`,
      metadata: { exportJobId: job.id, reportId: definition.id, format: input.format },
    },
  });

  return mapExportJob(job);
}

function mapExportJob(job: {
  id: string;
  type: string;
  status: ExportJobStatus;
  format: string;
  fileKey: string | null;
  downloadUrl: string | null;
  error: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}) {
  return {
    id: job.id,
    type: job.type,
    status: job.status.toLowerCase(),
    format: job.format,
    fileKey: job.fileKey ?? undefined,
    downloadUrl: job.downloadUrl ?? undefined,
    error: job.error ?? undefined,
    createdAt: job.createdAt.toISOString(),
    expiresAt: job.expiresAt?.toISOString(),
  };
}
