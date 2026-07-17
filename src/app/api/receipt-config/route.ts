import { requireUser } from "@/lib/auth/session";
import { assertSameOriginRequest, jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import {
  parseJsonBody,
  receiptConfigRequestSchema,
  RequestValidationError,
} from "@/lib/api/validation";
import { getDashboardState } from "@/lib/bookkeeping/persistence";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginRequest(request);
    const user = await requireUser();
    const body = await parseJsonBody(request, receiptConfigRequestSchema);
    const access = await requireBusinessAccess(user.id, "admin", body.businessId);

    await getPrisma().receiptConfig.upsert({
      where: { businessId: access.businessId },
      create: {
        businessId: access.businessId,
        logoUrl: normalizeOptional(body.logoUrl),
        address: normalizeOptional(body.address),
        phone: normalizeOptional(body.phone),
        email: normalizeOptional(body.email),
        taxId: normalizeOptional(body.taxId),
        footerMessage: normalizeOptional(body.footerMessage),
        includePoweredBy: body.includePoweredBy,
        defaultPaperSize: body.defaultPaperSize,
      },
      update: {
        logoUrl: normalizeOptional(body.logoUrl),
        address: normalizeOptional(body.address),
        phone: normalizeOptional(body.phone),
        email: normalizeOptional(body.email),
        taxId: normalizeOptional(body.taxId),
        footerMessage: normalizeOptional(body.footerMessage),
        includePoweredBy: body.includePoweredBy,
        defaultPaperSize: body.defaultPaperSize,
      },
    });

    return Response.json({
      state: await getDashboardState(access.businessId, access.role, user.id),
    });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    if (error instanceof RequestValidationError) {
      return jsonError(error.message, 400);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not save receipt settings.");
  }
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
