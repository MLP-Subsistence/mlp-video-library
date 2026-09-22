"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, ImageDown, Scissors, Search, Upload } from "lucide-react";
import { InlineNotice, Spinner, StatusPill } from "@/components/studio/ui";
import { api, kindForFile, uploadAsset } from "@/lib/studio/client";
import type { TemplateDto } from "@/lib/studio/templates";

type Match = { id: string; provider: string; externalId: string; previewUrl: string; pageUrl: string; description: string; status: "candidate" | "chosen" | "licensed"; assetUrl: string | null; assetId: string | null };
type MatchesResponse = { matches: Match[]; searchConfigured: boolean; licensingConfigured: boolean; template?: TemplateDto };

/**
 * Media library panel for one master segment: find the clean stock image
 * behind the captioned lesson frame, use it (API licence or uploaded file),
 * or fall back to the caption-cropped frame.
 */
export function MediaMatchesPanel({ templateId, segmentId, segmentKey, onTemplate }: { templateId: string; segmentId: string; segmentKey: string; onTemplate: (template: TemplateDto) => void }) {
  const [state, setState] = useState<MatchesResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "warning" | "error"; text: string } | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const base = `/api/studio/templates/${templateId}/segments/${segmentId}`;

  useEffect(() => {
    let cancelled = false;
    api<MatchesResponse>(`${base}/matches`)
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [base]);

  const run = async (label: string, action: () => Promise<MatchesResponse | void>, success?: string) => {
    setBusy(label);
    setNotice(null);
    try {
      const result = await action();
      if (result) {
        setState(result);
        if (result.template) onTemplate(result.template);
      }
      if (success) setNotice({ tone: "success", text: success });
    } catch (caught) {
      setNotice({ tone: "error", text: (caught as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const search = () => run("search", () => api<MatchesResponse>(`${base}/matches`, { method: "POST" }));
  const applyMatch = (match: Match, uploadedAssetId?: string) =>
    run(match.id, () => api<MatchesResponse>(`${base}/matches/${match.id}`, { method: "POST", json: { uploadedAssetId: uploadedAssetId ?? null } }), "This image is now the segment's visual.");
  const applyCleanFrame = () =>
    run("clean", async () => {
      const result = await api<{ template: TemplateDto }>(`${base}/clean-frame`, { method: "POST" });
      onTemplate(result.template);
    }, "Using the original frame with the caption band removed.");

  const handleUpload = async (match: Match, files: FileList | null) => {
    const file = files?.[0];
    setUploadFor(null);
    if (!file) return;
    if (kindForFile(file) !== "image") {
      setNotice({ tone: "error", text: "Please choose a JPG, PNG or WebP image." });
      return;
    }
    await run(match.id, async () => {
      const asset = await uploadAsset(file, { kind: "image", tags: `shutterstock, ${match.externalId}, licensed` });
      return api<MatchesResponse>(`${base}/matches/${match.id}`, { method: "POST", json: { uploadedAssetId: asset.id } });
    }, "Licensed image attached to this segment.");
  };

  const chosen = state?.matches.find((match) => match.status !== "candidate") ?? null;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#edf0f3] sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#6b7c8f]">Clean image for {segmentKey}</h3>
        {chosen && <StatusPill tone="ready">{chosen.status === "licensed" ? "Licensed via API" : "Stock image in use"}</StatusPill>}
      </div>
      <p className="mt-1 text-xs text-[#6b7c8f]">The original frame has burnt-in English captions. Find the same image on Shutterstock so localized videos stay clean, or use the frame with the caption band cut off.</p>
      {notice && <div className="mt-3"><InlineNotice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</InlineNotice></div>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-[#f2f4f7]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${base}/clean-frame`} alt="" className="h-full w-full object-cover" />
        </span>
        <button type="button" onClick={search} disabled={busy !== null || state?.searchConfigured === false} className="mlp-btn-primary h-10">
          {busy === "search" ? <Spinner /> : <Search className="size-4" />} Find on Shutterstock
        </button>
        <button type="button" onClick={applyCleanFrame} disabled={busy !== null} className="mlp-btn-outline h-10">
          {busy === "clean" ? <Spinner /> : <Scissors className="size-4" />} Use cropped frame
        </button>
      </div>
      {state && !state.searchConfigured && (
        <p className="mt-2 text-xs text-[#6b7c8f]">Shutterstock is not connected yet — an administrator needs to add the API token. The cropped-frame option works now.</p>
      )}
      {state && state.searchConfigured && !state.licensingConfigured && (
        <p className="mt-2 text-xs text-[#6b7c8f]">Licensing through the API needs a Shutterstock API subscription. Until then: open the match on Shutterstock, license it with the MLP account, and upload the downloaded file here.</p>
      )}

      {state && state.matches.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {state.matches.map((match) => (
            <div key={match.id} className={`overflow-hidden rounded-xl border bg-white ${match.status !== "candidate" ? "border-[#a64026] ring-2 ring-[#a64026]/20" : "border-[#d8dde5]"}`}>
              <span className="relative block aspect-video bg-[#f2f4f7]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={match.assetUrl || match.previewUrl} alt="" className="h-full w-full object-cover" />
                {match.status !== "candidate" && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#a64026] text-white"><Check className="size-3.5" /></span>}
              </span>
              <div className="space-y-2 p-2">
                <p className="line-clamp-2 text-[11px] leading-snug text-[#526579]" title={match.description}>{match.description || `Shutterstock ${match.externalId}`}</p>
                <div className="flex flex-wrap gap-1">
                  <a href={match.pageUrl} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-md border border-[#d8dde5] px-2 text-[11px] font-bold text-[#243447]"><ExternalLink className="size-3" /> Open</a>
                  {state.licensingConfigured ? (
                    <button type="button" onClick={() => applyMatch(match)} disabled={busy !== null} className="inline-flex h-7 items-center gap-1 rounded-md bg-[#a64026] px-2 text-[11px] font-extrabold text-white">
                      {busy === match.id ? <Spinner className="size-3" /> : <ImageDown className="size-3" />} License &amp; use
                    </button>
                  ) : (
                    <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-[#a64026] px-2 text-[11px] font-extrabold text-white">
                      {busy === match.id ? <Spinner className="size-3" /> : <Upload className="size-3" />} Upload licensed file
                      <input type="file" accept="image/*" className="hidden" onClick={() => setUploadFor(match.id)} onChange={(event) => void handleUpload(match, event.target.files)} disabled={busy !== null} />
                    </label>
                  )}
                  {match.assetId && match.status === "candidate" && (
                    <button type="button" onClick={() => applyMatch(match, match.assetId!)} disabled={busy !== null} className="inline-flex h-7 items-center gap-1 rounded-md border border-[#d8dde5] px-2 text-[11px] font-bold">Use again</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {uploadFor && <span className="sr-only">Choosing a file…</span>}
    </section>
  );
}
