"use server";

import { requireUser } from "@/lib/auth/session";
import { remindDebtForUser } from "@/lib/bookkeeping/persistence";

export async function sendDebtReminderAction(input: { businessId: string; debtId: string }) {
  try {
    const user = await requireUser();
    const result = await remindDebtForUser({
      userId: user.id,
      businessId: input.businessId,
      debtId: input.debtId,
      channel: "whatsapp",
    });

    if (result.whatsappResult && !result.whatsappResult.ok) {
      return { ok: false, message: result.message, state: result.state };
    }

    return { ok: true, message: result.message, state: result.state };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not send reminder.",
    };
  }
}
