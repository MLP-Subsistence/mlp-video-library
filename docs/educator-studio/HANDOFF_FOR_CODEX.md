# Educator Studio — Handoff for Codex

Written 2026-09-22 after the first implementation pass (Claude Code). Read this first; it tells you what the project is, where everything lives, what is done and verified, what is deliberately unfinished, and how to work in this repo without breaking the live site.

---

## 1. What this project is

**Marketplace Literacy Project (MLP) Video Library** is a live Next.js app at https://marketplaceliteracyapp.org. It is a resource library for educators: YouTube-hosted lesson videos organized by Language → Resource Format → Category, plus an `/admin` portal for MLP staff.

**Educator Studio** is the new authenticated module added to it. It lets an educator with no video-editing skills create a localized version of an existing lesson:

```
Choose Lesson → Choose Language → Translate → Review → Narrate → Review → Generate → Approve → Publish
```

It is **not** a non-linear video editor. The core model is:

- A **Master Video Template** (prepared once by a Content Manager) = an ordered list of **segments** with stable ids `seg_001`, `seg_002`…, each with a source script, a default pause, and a **visual composition** (layout + image/video slots, optionally several visuals in sequence per slot).
- A **Localization project** = one template × one target language. Each project segment carries its translation, its narration audio, and optional overrides. Segment identity is by id, never by text.
- **Audio is the timing authority.** `segment duration = narration length + educational pause`; visuals stretch to fit; the timeline is a visualization of that computed state. Changing one narration ripples through every later segment automatically.

The full product brief that drove this work is the "MASTER IMPLEMENTATION PROMPT" (101 sections); the audit that reconciles it with the real codebase is `docs/educator-studio/ARCHITECTURE_AUDIT.md`.

---

## 2. Location and repositories

| What | Where |
| --- | --- |
| Repo on disk | `C:\Users\uwish\Documents\Codex\2026-05-05\mlp-video-library` |
| Git remote | `https://github.com/MLP-Subsistence/mlp-video-library.git` (branch `main`) |
| Live deployment | Netlify → https://marketplaceliteracyapp.org (auto-builds from `main` on GitHub) |
| Local DB | SQLite `dev.db` (`DATABASE_URL="file:./dev.db"` in `.env`); production is Postgres via `DATABASE_URL` + `DIRECT_URL` |
| Do **not** confuse with | `C:\Users\uwish\Documents\Codex\2026-05-06\you-are-rebuilding-the-marketplace-literacy` (an older Sanity-based rebuild, not live) and `C:\Users\uwish\Documents\MLP-GitHub` (empty) |

**Git state right now:** 6 commits on local `main` above `origin/main` (`76ef866`), **not pushed**:

```
ecfff14 feat(studio): translation settings (region, dialect, audience, register, glossary) in the workspace
7b63684 docs(studio): deployment guide, env template, README; tests for timing, alignment and layouts
981b6f9 feat(studio): admin studio page, viewport-fit workspace, e2e script
20e199f feat(studio): educator studio UI — projects, workspace with synchronized timeline, AI voice, review, templates, assets
d8f7cce feat(studio): data model, storage, provider services, worker and API routes
a6429ab docs: Educator Studio architecture audit (first deliverable)
```

112 files changed, ~10.5k lines added, ~120 removed. Pushing `main` deploys to Netlify — **do not push until the deployment prerequisites in §7 are in place**, or the studio will exist on the live site with no storage bucket and no worker (the public site itself would still work; studio uploads and renders would fail with friendly errors).

Pre-existing, untouched working-tree state that belongs to the owner (leave it alone): modified `electron/main.cjs`; untracked `android/`, `deliverables/`, `docs/android/`, `docs/ios/*`, `.idea/`, `CHATGPT_THREAD_HANDOFF.md`, `MLP_APP_GPT_HANDOFF.md`, `build-check.log`.

---

## 3. The real stack (this matters — the brief assumed otherwise)

- **Next.js 16.2** App Router, React 19, TypeScript strict, Tailwind 4, `lucide-react`. `next build` no longer runs ESLint; run `npx eslint` yourself.
- **Prisma 5.22** with **two hand-synced schema files**: `prisma/schema.prisma` (SQLite) and `prisma/schema.postgres.prisma` (Postgres). Every model change must be made in both. No migrations folder; production uses `prisma db push` (gated by `RUN_DATABASE_SETUP=true` in `scripts/netlify-build.mjs`). JSON is stored as `String` columns so both schemas stay identical.
- **No Supabase SDK, no Supabase Auth, no Supabase Storage, no RLS.** Supabase, if used at all, is only the Postgres host. Authorization is enforced in server code (`src/lib/studio/access.ts`), not in the database.
- **Auth** = custom HMAC-signed cookie `mlp_admin_session` (`src/lib/auth.ts`), bcrypt passwords. Roles are strings on `User.role`: `admin`, `editor` (treated as **Content Manager**), `educator` (new).
- **Netlify** runs Next as serverless functions: ~10 s sync timeout, ~6 MB request bodies, no FFmpeg, no persistent disk. Hence: direct-to-storage uploads, a separate worker for rendering/alignment, and client-orchestrated batches for translation/voice.
- Existing uploads (`src/lib/uploads.ts`) write to local disk — fine for Electron, ephemeral on Netlify. The studio does **not** use that path.
- Design tokens are in `src/app/globals.css` (`.mlp-btn-primary`, `.mlp-card`, `.admin-sidebar-link`, colours `#a64026` brick, `#243447` text, `#f7f8fa` bg). The studio reuses them; do not introduce a new visual identity.

---

## 4. Code map

Everything new is namespaced under `studio`:

```
src/lib/roles.ts                         pure role helpers (normalizeRole, canAccessAdmin, canManageTemplates, safeNextPath)
src/lib/auth.ts                          existing auth + requireStudioUser(); re-exports roles
src/proxy.ts                             Next 16 "proxy" (middleware): /studio/* without cookie → /studio/login?next=…

src/lib/studio/
  types.ts            DTOs shared server↔client (ProjectDto, ProjectSegmentDto, Timeline, Composition…)
  layouts.ts          layout definitions as data (full, split2, panel3, grid4, grid5, grid6), composition parse/normalize
  timing.ts           computeTimeline() — THE timing engine (pure); blockAtTime, formatClock
  storage.ts          StorageService: local (disk) + s3 drivers, signed uploads, key safety
  access.ts           StudioError, studioRoute() wrapper, requireStudioApiUser, requireProjectAccess, assertTemplateManager
  permissions.ts      studioPermissions(user)
  projects.ts         projectWhereForUser (educators see only their own), listProjectSummaries
  project-state.ts    loadProjectDto() — builds the full project DTO incl. warnings + timeline (used by web AND worker)
  templates.ts        template DTOs, nextSegmentKey, splitTranscript
  settings.ts         StudioSettings singleton (id=1), glossary parsing
  languages.ts        target language list, audiences, registers (UI data)
  client.ts           browser helpers: api(), uploadAsset() (sign→PUT→register), measureMedia, debounce
  wav.ts              WAV builder/reader, placeholder speech, speech-length estimate
  services/
    openai.ts         fetch-only OpenAI client (chat JSON schema + transcription with word timestamps)
    translation.ts    TranslationService (batches ≤8, glossary/context prompt, strict JSON)
    voice-providers.ts VoiceProvider interface, mock provider, ElevenLabs adapter (OWNER TO FINISH)
    voice.ts          generateSegmentVoice(): credit check → ledger reserve → synthesize → store → update segment
    credits.ts        creditSummary, parseVoiceSettings, scriptHash
    alignment.ts      pure script↔word-timestamp aligner (Needleman–Wunsch + fuzzy tokens) → boundaries + confidence
    assets.ts         assetUsage(), deleteAssetSafely()
    jobs.ts           enqueueRenderJob/enqueueAlignJob, cancelJob, jobToDto, inline-worker kick (dev)
  __tests__/          node:test suites for timing, alignment, layouts (npm run test:studio)

src/worker/
  index.ts            poll loop (`npm run worker`), stale-job recovery
  process-job.ts      claim job → render/align → friendly error + errorDetail
  render.ts           FFmpeg pipeline: per-segment composition (scale/crop/pad, xstack-like overlay, sequential concat,
                      hold last frame for short clips), narration + pause, concat, optional music mix, thumbnail, upload
  align.ts            full-narration alignment job (transcode 16 kHz → OpenAI words → alignScriptToWords → update segments;
                      proportional fallback without OPENAI_API_KEY, everything flagged for review)
  ffmpeg.ts           spawn helpers, probe, materializeAsset (download from storage when not local)

src/app/api/studio/   JSON route handlers, all wrapped in studioRoute() and session-guarded
  uploads/sign, uploads/direct (local driver only), files/[...key] (serves local objects, supports Range)
  assets, assets/[id]
  templates, templates/[id], templates/[id]/segments, templates/[id]/segments/[segmentId]
  projects, projects/[id], projects/[id]/segments/[segmentId] (all per-segment edits/autosave),
  projects/[id]/translate, projects/[id]/voice, projects/[id]/full-narration, projects/[id]/render,
  projects/[id]/publish (approve | reopen | publish), projects/[id]/export (docx | html)
  jobs/[id] (poll/cancel), voice/voices, library (source videos + modules for templates)

src/app/studio/
  login/page.tsx                      educator sign-in (shares loginAction with /admin/login via portal=studio)
  (protected)/layout.tsx              StudioShell (dark sidebar like admin)
  (protected)/page.tsx                Projects landing + New Localization modal
  (protected)/projects/[id]/          Workspace | voice/ (AI Voice) | review/ (Review & Generate)
  (protected)/templates/, templates/[id]/, assets/   content-manager pages

src/components/studio/
  studio-shell.tsx, shell-project.tsx, ui.tsx (Modal/Drawer/Notice/pills), projects-page.tsx,
  asset-library.tsx (drawer), layout-editor.tsx (modal), templates-page.tsx, template-editor.tsx,
  assets-page.tsx, voice-page.tsx, review-page.tsx, job-progress.tsx ("Generating Your Video")
  workspace/
    workspace.tsx        three columns + timeline; single activeSegmentId drives everything
    use-project.ts       state container; every mutation replaces the whole ProjectDto from the server
    use-player.ts        preview player (rAF clock synced to a hidden <audio>; pauses/no-narration advance by clock)
    composition-preview.tsx  live layout preview at a time (same layout data as FFmpeg)
    timeline.tsx         the interactive timeline (tracks, playhead, scrub, zoom, warnings, auto-scroll)
    waveform.tsx         decoded peaks with cache; deterministic placeholder while decoding
    segment-list.tsx, script-panel.tsx (Original/Translation/Narration/Timing/Approve&Next),
    recorder.tsx (mic check + MediaRecorder), full-narration.tsx, translation-settings.tsx

src/app/admin/(protected)/studio/page.tsx + src/app/admin/studio-actions.ts   admin: users/credits, providers/glossary, jobs/ledger
scripts/studio-dev-seed.ts            gives the seeded admin 100k AI Voice credits
scripts/studio-e2e/run.mjs            full pipeline check against a running dev server (see §6)
scripts/studio-e2e/session-cookie.mts mints a session cookie for the e2e script
scripts/studio-e2e/queue-render.mts   queues a render job directly (tests a standalone worker)
docs/educator-studio/                 ARCHITECTURE_AUDIT.md, DEPLOYMENT.md, this file
```

Changed existing files (small, deliberate): `public-header.tsx` / `public-mobile-nav.tsx` (Admin Login → Educator Studio), `admin/actions.ts` (loginAction gains `portal` + safe `next`), `admin/(protected)/layout.tsx` (educators bounced to `/studio`), `admin/login/page.tsx`, `admin-shell.tsx` (nav link), `resource-format-player.tsx` + `resources/[language]/[format]/page.tsx` (public player can play a direct MP4 when a resource has no YouTube id), both Prisma schemas, `package.json` (deps `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `docx`; scripts `worker`, `test:studio`), `.gitignore` (`storage/`), `.env.example`, `README.md`.

---

## 5. Data model (added to both Prisma schemas)

`StudioSettings` (singleton: provider, models, global credit pool, shared glossary) · `StudioTemplate` (lesson, source Video, module, fps/frame, music asset) · `StudioSegment` (stable key, order, sourceScript, pauseAfterSec, composition JSON) · `StudioAsset` (image|video|audio; storageKey, url, dims, duration, tags) · `StudioProject` (template × language, region/variety/audience/register, glossary, default voice + settings, render quality, rendered asset, published Video id, status `in_progress|rendering|ready|approved|published`) · `StudioProjectSegment` (translation + status/source, narration asset/source/start/end/duration/status, script hash, alignment confidence, pause/composition/voice overrides, approvedAt) · `StudioFullNarration` · `StudioJob` (render|align; queued→preparing→rendering→finalizing→complete|failed|cancelled; friendly `error`, admin-only `errorDetail`) · `StudioVoiceUsage` (ledger). `User.aiVoiceCreditLimit` added.

Narration status semantics: `missing` → `ready` → `needs_update` (translation changed after narration was made; never silently kept) / `needs_review` (alignment confidence < 0.75).

---

## 6. What is done and how it was verified

Everything in §99 of the brief (steps 1–24) is implemented. Verified locally on 2026-09-22:

- `npx tsc --noEmit`, `npx eslint` on all studio paths, `npx next build --webpack`: clean.
- `npm run test:studio`: 14/14 pass (timing ripple incl. the V1 acceptance numbers, pauses, sequential shares, alignment confidence flagging, monotonic boundaries, layout parsing).
- `scripts/studio-e2e/run.mjs` against `next dev` (uses the **mock** voice provider, manual translations because no OpenAI key locally): signed upload of 2 images/1 clip/2 audio → 4-segment template with full/split2/sequence/grid4 compositions + music bed → Kinyarwanda project → approve translations → mock AI voice on 3 segments (credits charged, ledger written) → upload 7 s narration on segment 3 → timeline ripple **4.5→7.5 s, next segment 11.1→14.1 s, total 15.2→18.2 s** with no manual edit → editing a translation flipped narration to `needs_update`, regenerating fixed it → DOCX export 9 KB → 720p render completed (h264/aac 1280×720, compositions confirmed frame-by-frame) → approve → publish → resource visible and playable at `/resources/rw/global`.
- Standalone worker (`npm run worker`) processed a directly queued job to `complete`.
- Browser (built-in): login → landing → template creation from a library lesson → workspace three-column layout with timeline; clicking a timeline block selected the segment in list/preview/script panel and moved the playhead; Preview Segment played through the three sequential visuals and stopped at the segment end; AI Voice and Review pages render; mobile viewport stacks with "View Timeline".

Local `.env` currently has `STUDIO_INLINE_WORKER="true"`, `STUDIO_STORAGE_DRIVER="local"`, `NEXT_PUBLIC_SITE_URL="http://localhost:3000"` appended (dev convenience; media lands in `storage/studio/`, git-ignored). A dev server may still be running on :3000 from the test session.

---

## 7. What is NOT done / needs the owner

1. **ElevenLabs** — the owner said they will do this integration themselves. `src/lib/studio/services/voice-providers.ts` has the `VoiceProvider` interface, a working mock provider, and an ElevenLabs adapter written from memory of the API (voices list + text-to-speech with `voice_settings`); it has **not** been run. Set `ELEVENLABS_API_KEY`, verify the endpoints against current docs, then switch the provider in `/admin/studio → Providers & Glossary`. Credits, ledger, storage, timeline and rendering already work against the interface.
2. **OpenAI not exercised live** — no `OPENAI_API_KEY` locally. Translation (`services/translation.ts`, chat completions with `response_format: json_schema`) and alignment transcription (`services/openai.ts`, `whisper-1` `verbose_json` + `timestamp_granularities[]=word`) are written to current API shapes but untested against the real service. Without the key the app degrades gracefully (translation disabled with a friendly message; alignment falls back to a proportional split flagged for review).
3. **Production infrastructure** (see `DEPLOYMENT.md`): an S3-compatible bucket with CORS for `PUT` from the site (`STUDIO_S3_*`, `STUDIO_STORAGE_DRIVER=s3`), and a worker host with FFmpeg running `npm run worker` against the production DB. Apply the schema with `prisma db push --schema=prisma/schema.postgres.prisma`.
4. **Small known issue**: concatenated renders are ~0.1 s longer per segment than the computed timeline (AAC frame padding when concatenating per-segment MP4s with `-c copy`). Fix if it matters: encode audio once over the concatenated video, or concat with the `concat` filter and re-encode.
5. Publishing a project in a language that does not yet exist creates a `Language` row (visible in public navigation). Intentional, but confirm with the owner.
6. Not built (out of scope by the brief): unlimited tracks, transitions, keyframes, colour, VFX, audio mixer, multicam.

---

## 8. Working in this repo — rules of thumb

- **Any schema change goes in both `prisma/schema.prisma` and `prisma/schema.postgres.prisma`**, then `npx prisma db push` locally and `npx prisma generate`.
- Route files under `src/app/api/**` may only export HTTP verbs; put helpers in `src/lib/studio/**` (Next fails the build otherwise).
- `server-only` modules (`auth.ts`, `access.ts`, `voice.ts`) must not be imported by the worker; the worker runs under `tsx`, not Next. `project-state.ts`, `storage.ts`, `timing.ts`, `layouts.ts`, `alignment.ts`, `openai.ts` are shared and safe.
- Lint uses the React-Compiler-era hooks rules: no `setState` synchronously inside `useEffect`, no ref writes during render. The pattern used here is key-remounting per segment (`<ScriptPanel key={segment.id}>`) and deriving state instead of resetting it.
- Netlify limits: keep any single API request well under 10 s and 6 MB. Long work → `StudioJob` + worker. Big files → signed upload.
- Friendly errors only in `StudioError.message`; raw provider/FFmpeg text goes to `detail`/`errorDetail` (admin page).
- Windows shell quirks seen during this work: `node -e` with backticks and multi-line heredocs containing quotes misbehave in the Bash tool — write scripts to files instead. No Python on this machine. FFmpeg is at `C:\ffmpeg\bin`.
- Don't run repo-wide formatters; the existing code has its own style (long JSX lines, hex colours inline).

## 9. Quick start for the next session

```bash
cd C:\Users\uwish\Documents\Codex\2026-05-05\mlp-video-library
npm install
npx prisma db push && npx prisma generate
npx tsx scripts/studio-dev-seed.ts          # admin@marketplaceliteracy.org / ChangeMe123! gets credits
npm run dev                                 # http://localhost:3000/studio
npm run test:studio
```

Manual smoke path: Master Templates → New (pick a library lesson) → Layout & visuals (upload an image) → Mark ready → Projects → New Localization → write/approve a translation → Record → watch the timeline update → Review & Generate → Generate Video (inline worker needs FFmpeg on PATH) → Approve → Publish.

---

## 10. Update 2026-09-22 (later): Playlist → Lesson → Segments pipeline

Commits `8a711eb`, `85ecf21` (on top of the earlier seven, still unpushed). This also folded in Codex's uncommitted pacing work (`pauseBeforeSec`, visual duration controls, `STUDIO_MAX_UPLOAD_MB`, ElevenLabs `/v2/voices` pagination).

**What the owner asked:** educators go to a *playlist*, pick a *video*, and get that video's *segments* (the script lines) with the original visuals, ready to translate and narrate. The master lessons are the "Marketplace Literacy - Global" image-diary videos.

**Inputs on disk (owner-provided):**
- Master MP4s: `C:\Users\uwish\Downloads\YouTube Workflow Test\Trump — Sep 14\02_Original_Media` (41 files, `1-Introduction…` … `20-3 -Personal…`; `10 5 …` has no script and is skipped).
- Script (one line = one segment): `docs/educator-studio/scripts/marketplace-literacy-global-en.txt` (40 lessons; `7-1` repeats the value-chain text exactly as the owner supplied it).

**How it works (`src/lib/studio/services/master-import.ts`, CLI `scripts/studio-import-master.ts`):**
1. Parse the script into lessons (`3-1-Title` headings) and lines.
2. Match each lesson to a media file by number prefix.
3. `ffmpeg silencedetect` (−35 dB, ≥0.45 s) → speech chunks. The image-diary lessons are narrated one line at a time with pauses, so chunk count == line count in the normal case (Introduction: 13 = 13, exact). Otherwise boundaries are proportional to line length, snapped to the nearest pause, and the segment notes say "check the visual".
4. Upload the master MP4 as a `StudioAsset`, extract a poster frame per segment (also assets), create/refresh the `StudioTemplate` (status `ready`, `masterAssetId`), one `StudioSegment` per line with `sourceStartSec/EndSec`, `pauseAfterSec` from the measured gap, and composition = full-screen master video **starting at that segment's offset** (`CompositionItem.startSec`, new).
5. Library rows: ensures the playlist ("Marketplace Literacy - Global", English) and matches/creates the `Video` (matched by normalized title; new ones are `Draft`), sets its transcript.

Idempotent; lessons whose template already has projects are skipped.

**Run:**
```bash
npx tsx scripts/studio-import-master.ts --media "<folder>" [--only 1,2,3-1] [--playlist "Marketplace Literacy - Global"] [--format "Image Diaries"]
```
(needs `DATABASE_URL`, storage env, FFmpeg). Local run for lesson 1 verified end to end: template of 13 segments → New Localization (playlist → lesson → Kinyarwanda) → workspace shows per-segment master frames on the timeline and "Listen to the original (1.1 s)" → 720p render reproduces the original slides per segment (56.6 s, original pacing). A background run for all 40 lessons was started; check `/studio/templates` or re-run the CLI (idempotent).

**Lesson numbering & order (2026-09-22):** clips are named exactly as in the script — `1-Introduction to Marketplace Literacy`, `3-1-… Clip-1` — with the playlist suffix kept (`… — Youth Africa`); `src/lib/studio/lesson-order.ts` parses/strips/compares those numbers. The importer writes numbered titles and matches existing rows ignoring the number. `scripts/studio-rename-lessons.ts --playlist "<title>" [--title-suffix "— Youth Africa"] [--dry-run]` renames + re-orders an existing playlist (video title/resourceTitle/orderIndex, playlist position, template title). `/studio/templates` is grouped by playlist (main playlist first) in lesson order instead of "last edited". Applied to the 25 Youth Africa clips; the Global playlist is still unnumbered (same command without the suffix would number it).

**UI changes:** New Localization modal is now Playlist → Lesson (Ready / Prepare) → Language, backed by `GET /api/studio/library/playlists`. Script panel plays the original narration for the segment. Timeline thumbnails use `video#t=offset` so each segment shows its own frame. Before narration exists, a segment's placeholder length is its original duration (not a flat 4 s).

**Caveat to raise with the owner:** the master videos have burnt-in English subtitles, so a localized video keeps English captions under the new narration unless MLP supplies caption-free masters (or the segment visuals are replaced with the extracted poster frames/other assets, which the Layout Editor already allows).

**Production note:** two more additive columns since the last note — `StudioTemplate.masterAssetId`, `StudioSegment.sourceStartSec/sourceEndSec` (plus Codex's `pauseBeforeSec`). Apply to Postgres before deploying.

**Import results (local DB, 2026-09-22):** all 40 scripted lessons prepared as ready templates in the "Marketplace Literacy - Global" playlist. Speech-chunk vs. line counts: 11 exact, most within ±4 (the DP matcher groups breath pauses / splits run-on lines — verified on lesson 5 where the burnt-in captions match the segment frames), and a few far apart that content managers should eyeball: 7-1 (32 chunks vs 14 lines — the supplied 7-1 script duplicates the value-chain text and probably is not this video's script), 10-3 (8 vs 16), 16 (48 vs 38), 20-1 (38 vs 20), 20-2 (23 vs 16). Segments from non-exact lessons carry a note in the template editor. `scripts/studio-e2e/segment-sheet.mts` (`TEMPLATE_ID=… npx tsx scripts/studio-e2e/segment-sheet.mts`) renders a 12-frame contact sheet per template for this check.
