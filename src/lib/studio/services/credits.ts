import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getStudioSettings } from "@/lib/studio/settings";
import type { VoiceSettings } from "@/lib/studio/types";

/** AI Voice allowance bookkeeping. One credit = one character sent to the provider. */
export async function creditSummary(userId: string) {
  const [user, settings, personal, global] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { aiVoiceCreditLimit: true } }),
    getStudioSettings(),
    prisma.studioVoiceUsage.aggregate({ _sum: { credits: true }, where: { userId, status: { in: ["reserved", "charged"] } } }),
    prisma.studioVoiceUsage.aggregate({ _sum: { credits: true }, where: { status: { in: ["reserved", "charged"] } } })
  ]);
  const limit = user?.aiVoiceCreditLimit ?? 0;
  const used = personal._sum.credits ?? 0;
  const globalUsed = global._sum.credits ?? 0;
  const globalRemaining = settings.globalCreditPool > 0 ? Math.max(0, settings.globalCreditPool - globalUsed) : Number.POSITIVE_INFINITY;
  const remaining = Math.max(0, Math.min(limit - used, globalRemaining));
  return { limit, used, remaining: Number.isFinite(remaining) ? remaining : Math.max(0, limit - used), globalPool: settings.globalCreditPool, globalUsed };
}

export function scriptHash(text: string) {
  return createHash("sha1").update(text.trim()).digest("hex");
}

export function parseVoiceSettings(raw: string | null | undefined): VoiceSettings {
  try {
    const parsed = raw ? (JSON.parse(raw) as VoiceSettings) : {};
    const pick = (value: unknown, min: number, max: number) => (typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined);
    return {
      stability: pick(parsed.stability, 0, 1),
      similarity: pick(parsed.similarity, 0, 1),
      style: pick(parsed.style, 0, 1),
      speed: pick(parsed.speed, 0.7, 1.2)
    };
  } catch {
    return {};
  }
}
