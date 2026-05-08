import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { jsonError, jsonErrorFromUnknown } from "@/lib/api/http";
import { parseJsonBody, receiptUploadRequestSchema } from "@/lib/api/validation";
import { extractReceipt } from "@/lib/assist/receipts";
import { requireFeatureAccess } from "@/lib/billing/subscriptions";
import { requireBusinessAccess } from "@/lib/operations/access";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await parseJsonBody(request, receiptUploadRequestSchema);
    const access = await requireBusinessAccess(user.id, "money:write", body.businessId);
    const gated = await requireFeatureAccess(user.id, access.businessId, "receipt_extraction");

    if (gated) {
      return gated;
    }

    const extraction = extractReceipt(body.text);
    const receipt = await getPrisma().receipt.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        fileName: body.fileName,
        mimeType: body.mimeType,
        rawText: body.text.slice(0, 10_000),
        vendor: extraction.vendor,
        amount: extraction.amount ? new Prisma.Decimal(extraction.amount) : undefined,
        category: extraction.category,
      },
    });

    await getPrisma().auditLog.create({
      data: {
        businessId: access.businessId,
        actorId: user.id,
        action: "receipt.extracted",
        message: `${body.fileName} was extracted for review.`,
        metadata: extraction,
      },
    });

    return Response.json({
      receipt: {
        id: receipt.id,
        fileName: receipt.fileName,
        vendor: receipt.vendor,
        amount: receipt.amount?.toNumber(),
        category: receipt.category,
        confidence: extraction.confidence,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return jsonError("Sign in to continue.", error.status);
    }

    console.error(error);
    return jsonErrorFromUnknown(error, "Could not extract this receipt.");
  }
}
