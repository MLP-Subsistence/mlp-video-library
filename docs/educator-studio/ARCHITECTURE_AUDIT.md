# Educator Studio — Architecture Audit (First Deliverable)

Date: 2026-09-21
Repository: `MLP-Subsistence/mlp-video-library` (deployed at https://marketplaceliteracyapp.org, confirmed by the live header still showing "Admin Login" and `/api/health` returning `{"ok":true,"languages":6,"resources":607}`).

This document is the audit requested in sections 5/6 of the Educator Studio brief. It records what the existing application actually is (not what the brief assumed) and the integration strategy that follows from it.

## 1. Frontend architecture

- Next.js 16.2 App Router, React 19, TypeScript strict.
- Tailwind CSS 4 via `@tailwindcss/postcss`; global design tokens in `src/app/globals.css` (`.mlp-card`, `.mlp-btn-primary`, `.mlp-btn-outline`, `.mlp-btn-dark`, `.mlp-input`, `.mlp-badge`, `.mlp-soft-badge`, `.admin-sidebar-link`, `.mlp-drawer-link`).
- Icons: `lucide-react`. Fonts: system stack `Inter, Manrope, "Nunito Sans", Arial` (no webfont loaded).
- Colours: background `#f7f8fa`, text `#243447`, accent `#a64026` (brick), accent-dark `#624237`, muted `#6b7c8f`, line `#e5e7eb`, soft accent tint `#fbeaea` / `#f3e8e6`.
- Public pages are server components; the only client components are small interactive pieces (`public-mobile-nav`, `admin-shell`, `pending-submit-button`, `confirm-delete-button`, `resource-format-player`, `smart-image`).
- No global state library, no data-fetching library. Mutations are Next server actions (`src/app/admin/actions.ts`) with `redirect(...?success=|error=)` feedback rendered by `<Notice>`.

## 2. Backend architecture

- Everything runs inside Next.js: server components + server actions + two route handlers (`/api/health`, `/uploads/[file]`).
- No queue, no worker, no cron, no websockets. There is no existing background-job functionality.
- Validation is ad hoc (`src/lib/sanitize.ts`); `zod` is installed but unused.
- Errors: `console.error` + friendly redirect messages. No structured logging.

## 3. Database structure (Prisma 5.22)

- Two schema files kept in sync by hand: `prisma/schema.prisma` (SQLite, local/Electron) and `prisma/schema.postgres.prisma` (production). Any new model must be added to both.
- Models: `User(role: "editor"|"admin")`, `Language`, `Module` (category tree), `ResourceFormat`, `ResourceSubmenu`, `Playlist`, `Video` (the resource model — YouTube link + metadata + optional `transcript`), `PlaylistVideo`, `HomepageSection`, `HomepageSectionPlaylist`, `Settings` (singleton id=1).
- No migrations folder; production uses `prisma db push` gated by `RUN_DATABASE_SETUP=true` in `scripts/netlify-build.mjs`.

## 4. Supabase architecture

- **There is no Supabase SDK, Supabase Auth, Supabase Storage or RLS in this codebase.** `.env.example` says the hosted Postgres may be "Neon or Supabase" and Prisma connects with `DATABASE_URL` (pooled) + `DIRECT_URL`. Supabase, if used, is only a Postgres host.
- Consequence: the brief's "RLS" requirement maps to server-side authorization in Next (every studio route/action checks the session + project ownership). Row-level policies inside Postgres would not protect anything because the app connects with a single owner credential.

## 5. Storage architecture

- Uploads (`src/lib/uploads.ts`) write image files to local disk `public/uploads` (or `MLP_UPLOAD_DIR`) and serve them via `/uploads/[file]`. This works on Electron/Windows and dev, but on Netlify the filesystem is ephemeral — anything written at runtime disappears on the next deploy/instance.
- Video assets are YouTube links only; the app never stores media files.
- Consequence for Educator Studio: narration audio, images, video clips and rendered MP4s need durable object storage. The studio adds a `StorageService` with two drivers: `local` (disk; dev/Electron/self-hosted) and `s3` (any S3-compatible bucket: Supabase Storage S3 endpoint, Cloudflare R2, AWS S3, MinIO). Uploads go **directly from the browser to storage** via signed URLs because Netlify functions cap request bodies at ~6 MB.

## 6. Netlify architecture

- `netlify.toml`: `npm run build:netlify`, publish `.next`, Node 20, skew protection, `/admin/*` noindex. Next runs through Netlify's Next runtime (serverless functions, 10 s default sync timeout, no FFmpeg, no persistent disk).
- Consequence: FFmpeg rendering and long speech alignment cannot run inside the site. They run in a separate **worker** (`worker/`) that polls the same database for `StudioJob` rows. Translation and per-segment voice generation are short enough to run inline in route handlers, orchestrated one segment/batch at a time from the client.

## 7. Authentication

- Custom HMAC-signed cookie `mlp_admin_session` (`src/lib/auth.ts`), 12 h expiry, bcrypt passwords, in-memory login rate limiting. `getCurrentUser()` looks the user up by id; `requireAdmin()` does **not** check `role`.
- Educator Studio reuses this exact session. A shared login action gains a safe `next` redirect so `/studio/login` returns educators to Studio; `/admin/login` keeps working for staff.

## 8. Educator / admin role strategy

- Keep `User.role` as a string. Values: `admin` (Administrator), `editor` (existing staff — treated as **Content Manager**), `educator` (new).
- `admin` + `editor` may use `/admin`; `educator` is redirected from `/admin` to `/studio`. All three may use Studio; template/asset/timing management requires `editor` or `admin`.
- Users, roles and AI Voice credit allowances are managed at `/admin/studio`.

## 9. Existing content / resource model

- `Video` = resource (YouTube link, language, module/category, resource format, transcript, duration string, visibility).
- Lessons for localization are `Video` rows. A Master Video Template links to a source `Video` (optional) and carries its own ordered segments. Publishing creates/updates a `Video` row in the target language pointing at the rendered MP4 (served from storage) with the same category/format.

## 10. Educator Studio integration strategy

- New route group `src/app/studio/**` with its own shell (`StudioShell`) built from the admin sidebar tokens.
- Public header/mobile nav: "Admin Login" → "Educator Studio" (`/studio`). `/admin/login` stays reachable directly.
- API for the interactive workspace lives in `src/app/api/studio/**` route handlers (JSON), all guarded by `requireStudioUser()` + project access checks.
- Provider abstractions in `src/lib/studio/services/*`: `TranslationService` (OpenAI), `VoiceGenerationService` (ElevenLabs adapter left for the owner + `mock` provider), `SpeechAlignmentService` (OpenAI transcription word timestamps + script alignment), `RenderService` (job enqueue; FFmpeg in worker), `StorageService`.

## 11. Master Video Template proposal

`StudioTemplate` = one prepared lesson: source `Video`, source language, 1920×1080 @ 30 fps, optional music/SFX asset, ordered `StudioSegment`s. Content Managers build it in `/studio/templates/[id]`.

## 12. Segment data model

`StudioSegment` (master, stable key `seg_001`, `seg_002`… unique per template): `orderIndex`, `title`, `sourceScript`, `pauseAfterSec`, `composition` JSON.
`StudioProjectSegment` (per localization, unique `(projectId, segmentId)`): translation text/status/source, narration asset + source + duration + optional start/end within a full narration, narration status, alignment confidence, optional pause/composition/voice overrides, review flags.
Localizations never derive segment identity from text — they reference `segmentId`.

## 13. Translation architecture

`TranslationService.translateSegments()` sends batches (≤8) to the OpenAI Responses API with lesson title, module, neighbouring segments, target language/region/variety/audience/register and glossary; returns strict JSON keyed by segment key. Human edits set `translationSource = human` and are never overwritten by "Translate Entire Lesson" (only untouched/AI segments are refreshed); "Regenerate This Segment" is explicit. Changing an approved translation flips narration to `needs_update`.

## 14. Asset architecture

`StudioAsset` (image | video | audio): storage key, public URL, mime, size, width/height, duration, thumbnail, tags, uploader. Global library, filterable. Deletion checks references in template compositions and project narration and refuses with a count.

## 15. Visual-composition architecture

`composition` JSON: `{ layout: "full"|"split2"|"panel3"|"grid4"|"grid5"|"grid6", slots: [{ id, fit: "cover"|"contain", items: [{ assetId, share }] }] }`. A slot with several items is a sequential sub-timeline inside that slot; `share` values are proportions of the segment duration so internal timings follow narration automatically. Layouts are data (`src/lib/studio/layouts.ts`), not hard-coded to six.

## 16. Narration architecture

Four inputs (record / AI voice / upload / full narration) all end as `narrationAssetId` + `narrationDurationSec` (+ `narrationStartSec/EndSec` for slices of a full recording). `computeTimeline()` derives every segment's start/duration from narration + pause; it is the single timing authority used by the timeline, preview, review and render.

## 17. ElevenLabs architecture

`VoiceGenerationService` → `VoiceProvider` interface (`listVoices`, `synthesize`). `providers/elevenlabs.ts` is a thin adapter around `ELEVENLABS_API_KEY` that the owner will finish; `providers/mock.ts` produces a silent WAV sized from the text so the whole pipeline (credits, ledger, timeline, render) is testable without ElevenLabs.

## 18. AI Voice credit architecture

1 credit = 1 character sent to the provider. `User.aiVoiceCreditLimit` per educator + `StudioSettings.globalCreditPool`. `StudioVoiceUsage` ledger rows are written *before* the provider call (reserved) and finalized after. Server checks auth, project access, allowance, voice/model validity and an idempotency key before calling the provider.

## 19. Full-audio alignment architecture

Upload full narration → `StudioFullNarration` + `StudioJob(type=align)` → worker transcodes to 16 kHz mono, calls OpenAI transcription with word timestamps and a language hint, then aligns the approved translated scripts to the word stream with a monotonic DP matcher → boundaries + per-segment confidence. ≥0.75 auto-ready, otherwise `needs_review`. Corrections edit `narrationStartSec/EndSec` and recompute the timeline.

## 20. Interactive timeline architecture

Pure client component fed by `computeTimeline(projectState)`. Video + Audio tracks (+ Music when present), proportional widths, alternating separators, selected-segment accent, pause shading, warning markers, playhead, click-to-seek, drag scrub, zoom/fit, auto-scroll to selection, expanded sub-items for the selected multi-visual segment. Selection is a single `activeSegmentId` shared with the segment list, preview and script panel.

## 21. Rendering architecture

Worker: per segment build the composition with FFmpeg (`scale`/`pad`/`xstack`/`overlay`, still-image loops, video hold-last-frame), mux narration + trailing pause, concat all segments, optionally mix music, encode H.264/AAC at 1080p (default) or 720p, upload to storage, attach to job → project.

## 22. Job / worker requirements

`worker/` = Node + tsx + Prisma + FFmpeg (system or `ffmpeg-static`). Runs anywhere with a database URL and storage credentials (a VPS, Fly.io/Railway, or the MLP Windows machine). Job states: queued → preparing → rendering → finalizing → complete | failed, with progress %, friendly `error` and admin-only `errorDetail`. Locking via `lockedBy/lockedAt` so several workers can run.

## 23. Security implications

- All provider keys server/worker-only (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `STUDIO_S3_*`). Nothing under `NEXT_PUBLIC_`.
- Every `/api/studio` handler: session → role → project ownership (educators only see their own projects; content managers/admins see all).
- Signed upload URLs are content-type + size restricted and expire in 15 min.
- Raw provider/FFmpeg errors go to `StudioJob.errorDetail` / server logs only.

## 24. Database migrations

Additive only. New models: `StudioSettings`, `StudioTemplate`, `StudioSegment`, `StudioAsset`, `StudioProject`, `StudioProjectSegment`, `StudioFullNarration`, `StudioJob`, `StudioVoiceUsage`. `User` gains `aiVoiceCreditLimit`. Both Prisma schema files updated; applied with `prisma db push` as today.

## 25. Storage changes

New env: `STUDIO_STORAGE_DRIVER=local|s3`, `STUDIO_STORAGE_DIR`, `STUDIO_S3_ENDPOINT`, `STUDIO_S3_REGION`, `STUDIO_S3_BUCKET`, `STUDIO_S3_ACCESS_KEY_ID`, `STUDIO_S3_SECRET_ACCESS_KEY`, `STUDIO_S3_PUBLIC_URL`. Local driver serves files through `/api/studio/files/[...key]`.

## 26. Infrastructure additions

- Object storage bucket (S3-compatible).
- One long-running worker process with FFmpeg.
- `OPENAI_API_KEY` (translation + alignment), `ELEVENLABS_API_KEY` (owner will wire the adapter).

## 27. Implementation phases

1. Navigation + educator auth + roles + StudioShell.
2. Data model + storage service + asset library.
3. Master templates + segments + compositions + layout editor.
4. Projects + translation (OpenAI) + script export.
5. Narration: record / upload / AI voice (credits, ledger, mock provider) / full narration import.
6. Timing engine + synchronized timeline + preview player.
7. Review & Generate + render worker + publish.
8. Admin studio pages (users, credits, jobs, settings) + docs + tests.
