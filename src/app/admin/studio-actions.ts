"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { isAdminRole, normalizeRole, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanOptional, cleanText } from "@/lib/sanitize";
import { getStudioSettings } from "@/lib/studio/settings";
import { RECOMMENDED_TRANSLATION_MODEL } from "@/lib/studio/services/translation";

const PAGE = "/admin/studio";

async function guardAdmin() {
  const user = await requireAdmin();
  if (!user) redirect("/admin/login");
  if (!isAdminRole(user.role)) redirect(`${PAGE}?error=Only administrators can manage Educator Studio users and settings.`);
  return user;
}

function back(message: { success?: string; error?: string }, tab = "users") {
  const query = new URLSearchParams({ tab });
  if (message.success) query.set("success", message.success);
  if (message.error) query.set("error", message.error);
  revalidatePath(PAGE);
  redirect(`${PAGE}?${query.toString()}`);
}

export async function createStudioUserAction(formData: FormData) {
  await guardAdmin();
  const name = cleanText(formData.get("name"));
  const email = cleanText(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = normalizeRole(cleanText(formData.get("role")));
  const credits = Math.max(0, Math.round(Number(formData.get("aiVoiceCreditLimit")) || 0));
  if (!name || !email.includes("@")) back({ error: "Name and a valid email are required." });
  if (password.length < 10) back({ error: "Password must be at least 10 characters." });
  if (await prisma.user.findUnique({ where: { email } })) back({ error: "A user with that email already exists." });
  await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12), role, aiVoiceCreditLimit: credits } });
  back({ success: `${name} can now sign in to Educator Studio.` });
}

export async function updateStudioUserAction(formData: FormData) {
  const admin = await guardAdmin();
  const id = cleanText(formData.get("id"));
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) back({ error: "User not found." });
  const role = normalizeRole(cleanText(formData.get("role")));
  const credits = Math.max(0, Math.round(Number(formData.get("aiVoiceCreditLimit")) || 0));
  if (user!.id === admin.id && role !== "admin") back({ error: "You cannot remove your own administrator role." });
  const password = String(formData.get("password") ?? "");
  if (password && password.length < 10) back({ error: "Password must be at least 10 characters." });
  await prisma.user.update({
    where: { id },
    data: { name: cleanText(formData.get("name")) || user!.name, role, aiVoiceCreditLimit: credits, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) }
  });
  back({ success: `Updated ${user!.name}.` });
}

export async function deleteStudioUserAction(formData: FormData) {
  const admin = await guardAdmin();
  const id = cleanText(formData.get("id"));
  if (id === admin.id) back({ error: "You cannot delete your own account." });
  const projects = await prisma.studioProject.count({ where: { createdById: id } });
  if (projects > 0) back({ error: `This user owns ${projects} localization project${projects === 1 ? "" : "s"}. Delete or reassign those first.` });
  await prisma.user.delete({ where: { id } });
  back({ success: "User removed." });
}

export async function updateStudioSettingsAction(formData: FormData) {
  await guardAdmin();
  await getStudioSettings();
  const provider = cleanText(formData.get("voiceProvider")) === "elevenlabs" ? "elevenlabs" : "mock";
  await prisma.studioSettings.update({
    where: { id: 1 },
    data: {
      voiceProvider: provider,
      voiceModel: cleanText(formData.get("voiceModel")) || "eleven_multilingual_v2",
      translationModel: cleanText(formData.get("translationModel")) || RECOMMENDED_TRANSLATION_MODEL,
      transcriptionModel: cleanText(formData.get("transcriptionModel")) || "whisper-1",
      globalCreditPool: Math.max(0, Math.round(Number(formData.get("globalCreditPool")) || 0)),
      glossary: (cleanOptional(formData.get("glossary")) ?? "").slice(0, 8000),
      defaultPlaylistId: cleanOptional(formData.get("defaultPlaylistId"))
    }
  });
  back({ success: "Studio settings saved." }, "settings");
}

export async function retryStudioJobAction(formData: FormData) {
  await guardAdmin();
  const id = cleanText(formData.get("id"));
  const job = await prisma.studioJob.findUnique({ where: { id } });
  if (!job || !["failed", "cancelled"].includes(job.status)) back({ error: "Only failed or cancelled jobs can be retried." }, "jobs");
  await prisma.studioJob.update({ where: { id }, data: { status: "queued", progress: 0, stage: "Waiting for the render worker", error: null, errorDetail: null, lockedBy: null, lockedAt: null, finishedAt: null } });
  if (job!.type === "render") await prisma.studioProject.update({ where: { id: job!.projectId }, data: { status: "rendering", latestRenderJobId: job!.id } });
  back({ success: "Job queued again." }, "jobs");
}
