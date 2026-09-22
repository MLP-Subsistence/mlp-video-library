import { ok, requireStudioApiUser, assertTemplateManager, StudioError, studioRoute } from "@/lib/studio/access";
import { cloneVoice } from "@/lib/studio/services/voice";

const MAX_SAMPLES = 8;

/**
 * Instant voice cloning from recordings the team already has. The samples are
 * sent straight to the provider and never stored by the studio; no narration
 * credits are used, only one of the account's voice slots.
 */
export const POST = studioRoute(async (request: Request) => {
  const user = await requireStudioApiUser();
  assertTemplateManager(user);
  const form = await request.formData().catch(() => null);
  if (!form) throw new StudioError("Send the recordings as a form upload.");
  const name = String(form.get("name") ?? "");
  const description = String(form.get("description") ?? "").slice(0, 400) || undefined;
  const removeBackgroundNoise = form.get("removeBackgroundNoise") === "true";
  const entries = form.getAll("files").filter((entry): entry is File => entry instanceof File).slice(0, MAX_SAMPLES);
  const files = await Promise.all(
    entries.map(async (file) => ({
      filename: file.name || "sample.mp3",
      contentType: file.type || "audio/mpeg",
      bytes: Buffer.from(await file.arrayBuffer())
    }))
  );
  const voice = await cloneVoice({ name, description, removeBackgroundNoise, files });
  return ok({ voice });
});
