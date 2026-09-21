// End-to-end API exercise for Educator Studio: login → upload assets → build template → project → narration → render.
import { readFile } from "node:fs/promises";

const base = process.env.STUDIO_BASE_URL || "http://localhost:3000";
const mediaDir = (process.env.STUDIO_MEDIA_DIR || process.cwd()).split("\\").join("/");
let cookie = "";

/** Session cookie from `npx tsx scripts/studio-e2e/session-cookie.mts` (pass via STUDIO_COOKIE) or a cookie.txt next to the media. */
async function login() {
  cookie = process.env.STUDIO_COOKIE || (await readFile(new URL("./cookie.txt", `file://${mediaDir}/`), "utf8")).trim();
  if (!cookie.startsWith("mlp_admin_session=")) throw new Error("STUDIO_COOKIE missing");
  console.log("using session cookie");
}

async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { cookie, ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...(init.headers || {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(`${path} → ${response.status} ${typeof data === "string" ? data.slice(0, 200) : data.error}`);
  return data;
}

async function upload(file, kind, mimeType, extra = {}) {
  const bytes = await readFile(`${mediaDir}/${file}`);
  const signed = await api("/api/studio/uploads/sign", { method: "POST", json: { name: file, mimeType, size: bytes.length, kind } });
  const put = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: bytes });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  const registered = await api("/api/studio/assets", { method: "POST", json: { storageKey: signed.storageKey, name: file, mimeType, size: bytes.length, kind, ...extra } });
  console.log("uploaded", kind, registered.asset.id, registered.asset.url);
  return registered.asset;
}

await login();
const imgA = await upload("imgA.png", "image", "image/png", { width: 1600, height: 900 });
const imgB = await upload("imgB.jpg", "image", "image/jpeg", { width: 1200, height: 1200 });
const clipC = await upload("clipC.mp4", "video", "video/mp4", { width: 640, height: 360, durationSec: 3 });
const narr = await upload("narr7.wav", "audio", "audio/wav", { durationSec: 7 });
const music = await upload("music.mp3", "audio", "audio/mpeg", { durationSec: 30 });

// Template with 4 segments (acceptance test: 5, 6, 4, 8 seconds of narration)
const created = await api("/api/studio/templates", { method: "POST", json: { title: "Timeline Acceptance Lesson", sourceLanguageCode: "en" } });
const templateId = created.id;
const scripts = [
  "Transportation helps people reach different marketplaces efficiently.",
  "A marketplace is where buyers and sellers meet to exchange goods.",
  "Consumers compare prices before choosing what to buy.",
  "Entrepreneurs plan their business around what customers need and want."
];
for (const [index, text] of scripts.entries()) {
  await api(`/api/studio/templates/${templateId}/segments`, { method: "POST", json: { title: ["Transportation", "Marketplace", "Consumers", "Entrepreneurs"][index], sourceScript: text } });
}
let template = (await api(`/api/studio/templates/${templateId}`)).template;
const compositions = [
  { layout: "full", slots: [{ id: "slot_1", fit: "cover", items: [{ assetId: imgA.id, share: 1 }] }] },
  { layout: "split2", slots: [{ id: "slot_1", fit: "cover", items: [{ assetId: imgB.id, share: 1 }] }, { id: "slot_2", fit: "contain", items: [{ assetId: clipC.id, share: 1 }] }] },
  { layout: "full", slots: [{ id: "slot_1", fit: "cover", items: [{ assetId: imgA.id, share: 0.4 }, { assetId: imgB.id, share: 0.3 }, { assetId: clipC.id, share: 0.3 }] }] },
  { layout: "grid4", slots: [{ id: "slot_1", fit: "cover", items: [{ assetId: imgA.id, share: 1 }] }, { id: "slot_2", fit: "cover", items: [{ assetId: imgB.id, share: 1 }] }, { id: "slot_3", fit: "cover", items: [{ assetId: clipC.id, share: 1 }] }, { id: "slot_4", fit: "contain", items: [{ assetId: imgA.id, share: 1 }] }] }
];
for (const [index, segment] of template.segments.entries()) {
  template = (await api(`/api/studio/templates/${templateId}/segments/${segment.id}`, { method: "PATCH", json: { composition: compositions[index], pauseAfterSec: 0.5 } })).template;
}
template = (await api(`/api/studio/templates/${templateId}`, { method: "PATCH", json: { status: "ready", musicAssetId: music.id, musicVolume: 0.15 } })).template;
console.log("template ready", template.id, template.segments.map((s) => s.key));

// Project
const projectCreated = await api("/api/studio/projects", { method: "POST", json: { templateId, languageCode: "rw", languageName: "Kinyarwanda", region: "Rwanda", audience: "Adult learners" } });
let project = (await api(`/api/studio/projects/${projectCreated.id}`)).project;
console.log("project", project.id, "segments", project.segments.length, "total", project.timeline.totalSec);

// Translations (manual — no OpenAI key locally) + approve
const translations = ["Ubwikorezi bufasha abantu kugera ku masoko atandukanye neza.", "Isoko ni aho abaguzi n'abacuruzi bahurira.", "Abaguzi bagereranya ibiciro mbere yo guhitamo.", "Ba rwiyemezamirimo bategura ubucuruzi bwabo hakurikijwe ibyo abakiriya bakeneye."];
for (const [index, segment] of project.segments.entries()) {
  project = (await api(`/api/studio/projects/${project.id}/segments/${segment.id}`, { method: "PATCH", json: { translation: translations[index], translationAction: "approve" } })).project;
}
console.log("translations approved:", project.segments.map((s) => s.translationStatus).join(","));

// Narration: segments 1,2,4 via mock AI voice; segment 3 via uploaded 7s audio (acceptance test step)
const voices = await api("/api/studio/voice/voices");
project = (await api(`/api/studio/projects/${project.id}`, { method: "PATCH", json: { defaultVoiceId: voices.voices[0].id, defaultVoiceName: voices.voices[0].name } })).project;
for (const index of [0, 1, 3]) {
  const result = await api(`/api/studio/projects/${project.id}/voice`, { method: "POST", json: { projectSegmentId: project.segments[index].id } });
  project = result.project;
}
console.log("after AI voice → durations", project.segments.map((s) => s.narration.durationSec), "total", project.timeline.totalSec, "credits", project.credits);
const before = project.timeline.blocks.map((b) => [b.key, b.startSec, b.durationSec]);
project = (await api(`/api/studio/projects/${project.id}/segments/${project.segments[2].id}`, { method: "PATCH", json: { narration: { assetId: narr.id, durationSec: 7, source: "upload" } } })).project;
const after = project.timeline.blocks.map((b) => [b.key, b.startSec, b.durationSec]);
console.log("before", JSON.stringify(before));
console.log("after ", JSON.stringify(after), "total", project.timeline.totalSec);
console.log("warnings", project.segments.map((s) => s.warnings.map((w) => w.code)));

// Translation change invalidates narration
project = (await api(`/api/studio/projects/${project.id}/segments/${project.segments[0].id}`, { method: "PATCH", json: { translation: translations[0] + " Byongeye." } })).project;
console.log("after edit seg1 narration status:", project.segments[0].narration.status, "translation:", project.segments[0].translationStatus);
project = (await api(`/api/studio/projects/${project.id}/segments/${project.segments[0].id}`, { method: "PATCH", json: { translationAction: "approve" } })).project;
project = (await api(`/api/studio/projects/${project.id}/voice`, { method: "POST", json: { projectSegmentId: project.segments[0].id } })).project;
console.log("regenerated seg1:", project.segments[0].narration.status);

// Export
const docx = await fetch(`${base}/api/studio/projects/${project.id}/export?format=docx`, { headers: { cookie } });
console.log("docx", docx.status, docx.headers.get("content-type"), (await docx.arrayBuffer()).byteLength, "bytes");

// Render
const render = await api(`/api/studio/projects/${project.id}/render`, { method: "POST", json: { quality: "720p" } });
console.log("render job", render.job.id, render.job.status);
for (let i = 0; i < 120; i++) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const status = await api(`/api/studio/jobs/${render.job.id}?project=1`);
  process.stdout.write(`\r${status.job.status} ${status.job.progress}% ${status.job.stage ?? ""}        `);
  if (!["queued", "preparing", "rendering", "finalizing"].includes(status.job.status)) {
    console.log("\njob:", status.job.status, status.job.error ?? "", status.job.outputAssetUrl ?? "");
    console.log("project status", status.project?.status, status.project?.renderedAssetUrl);
    break;
  }
}
console.log("PROJECT_ID", project.id, "TEMPLATE_ID", templateId);
