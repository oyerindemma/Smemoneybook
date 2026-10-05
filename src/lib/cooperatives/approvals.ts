import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export async function recordCooperativeApprovalAction({
  tx,
  businessId,
  groupId,
  targetType,
  targetId,
  action,
  actorId,
  reason,
  metadata,
}: {
  tx?: Prisma.TransactionClient;
  businessId: string;
  groupId: string;
  targetType: "loan" | "contribution" | "transfer" | "member" | string;
  targetId: string;
  action: string;
  actorId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const client = tx ?? getPrisma();

  return client.cooperativeApprovalAction.create({
    data: {
      businessId,
      groupId,
      targetType,
      targetId,
      action,
      actorId,
      reason,
      metadata: metadata as Prisma.InputJsonObject | undefined,
    },
  });
}
