# Educator Studio — Deployment & Operations

Educator Studio adds three things to the existing MLP Video Library deployment:

1. **New database tables** (Prisma, additive) — applied with `prisma db push` exactly like today.
2. **Durable media storage** — an S3-compatible bucket, because Netlify has no persistent disk and its functions cap request bodies at ~6 MB (browsers upload straight to the bucket with signed URLs).
3. **A worker process with FFmpeg** — renders videos and aligns full narration recordings. It cannot run inside Netlify functions.

Translation and per-segment AI Voice generation run inside the Next.js app (short requests, called one segment at a time from the browser).

## 1. Database

Both schemas (`prisma/schema.prisma` for SQLite, `prisma/schema.postgres.prisma` for production) already contain the studio models.

Production (Postgres): set `RUN_DATABASE_SETUP=true` for one Netlify build (as documented in the README) or run locally against the hosted database:

```bash
DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." npx prisma db push --schema=prisma/schema.postgres.prisma
```

Nothing is dropped; existing tables are untouched. `User` gains `aiVoiceCreditLimit`.

## 2. Storage bucket

Create a bucket (Supabase Storage with the S3 protocol enabled, Cloudflare R2, or AWS S3) and give it a public read URL. Then set on Netlify **and** on the worker:

| Variable | Example |
| --- | --- |
| `STUDIO_STORAGE_DRIVER` | `s3` |
| `STUDIO_S3_ENDPOINT` | `https://<project>.supabase.co/storage/v1/s3` (R2: `https://<account>.r2.cloudflarestorage.com`) |
| `STUDIO_S3_REGION` | `auto` (Supabase/R2) or the AWS region |
| `STUDIO_S3_BUCKET` | `educator-studio` |
| `STUDIO_S3_ACCESS_KEY_ID` / `STUDIO_S3_SECRET_ACCESS_KEY` | bucket credentials |
| `STUDIO_S3_PUBLIC_URL` | public base URL of the bucket (Supabase: `https://<project>.supabase.co/storage/v1/object/public/educator-studio`) |
| `STUDIO_MAX_UPLOAD_MB` | Optional per-file cap; set to `50` when the Supabase bucket is limited to 50 MB. The Studio will show a clear error before upload. |

CORS on the bucket must allow `PUT` from `https://marketplaceliteracyapp.org` (browsers upload directly). If `STUDIO_S3_PUBLIC_URL` is omitted the app proxies files through `/api/studio/files/...`, which works but is slower.

`local` driver (default) stores files under `storage/studio/` — fine for development, the Electron build and any single-server hosting where the web app and worker share a disk.

## 3. Provider keys (server-side only)

| Variable | Used for |
| --- | --- |
| `OPENAI_API_KEY` | Translation (chat completions, model from `/admin/studio → Providers`, default `gpt-4.1-mini`) and full-narration alignment (`whisper-1` word timestamps, run by the worker). Without it, translation is disabled with a friendly message and full-narration import falls back to a proportional split that flags every segment for review. |
| `ELEVENLABS_API_KEY` | AI Voice. Select **ElevenLabs** as the provider under `/admin/studio → Providers`. Until then the **Placeholder voice** provider produces silent, correctly timed audio so the whole pipeline (credits, timeline, render) can be exercised without billing. The adapter lives in `src/lib/studio/services/voice-providers.ts`. |

Keys are never stored in the database and never sent to the browser.

## 4. Worker

Any machine with Node 20+, FFmpeg/FFprobe and network access to the database and bucket:

```bash
npm ci
export DATABASE_URL=...            # same database as the site
export STUDIO_STORAGE_DRIVER=s3    # + the STUDIO_S3_* variables
export OPENAI_API_KEY=...          # alignment
export NEXT_PUBLIC_SITE_URL=https://marketplaceliteracyapp.org
npm run worker
```

Options: `FFMPEG_PATH`/`FFPROBE_PATH` when FFmpeg is not on PATH, `STUDIO_WORKER_POLL_MS` (default 4000), `STUDIO_WORK_DIR` (scratch), `STUDIO_X264_PRESET` (`medium` default; `veryfast` on small machines).

Suitable hosts: a small VPS, Fly.io/Railway/Render background service, or the MLP office Windows machine (FFmpeg is already installed at `C:\ffmpeg\bin`). Several workers may run at once; jobs are claimed atomically and stale jobs are re-queued after 30 minutes.

Job states: `queued → preparing → rendering → finalizing → complete | failed | cancelled`. Educators see friendly messages; `/admin/studio → Jobs & Usage` shows the technical detail and a **Retry** button.

Development shortcut: `STUDIO_INLINE_WORKER=true` in `.env` runs jobs inside `next dev` (FFmpeg required). Do not set this on Netlify.

## 5. Roles and access

| Role (`User.role`) | Can |
| --- | --- |
| `educator` (new) | Educator Studio: own projects, translate, record/upload/AI voice, import full narration, timeline, generate video |
| `editor` = Content Manager (existing staff accounts) | everything above for all projects + master templates, asset library, timing corrections, publish, `/admin` |
| `admin` | everything + `/admin/studio` (users, credits, providers, jobs) |

Public "Admin Login" became **Educator Studio** (`/studio`). Staff still use `/admin/login` directly; educators who land there are redirected to `/studio`.

## 6. AI Voice credits

1 credit = 1 character sent to the voice provider. Each user has an allowance (`/admin/studio → Users & Credits`); an optional global pool caps everyone together. Generation is refused server-side when the allowance is exhausted; the ledger (`StudioVoiceUsage`) records every request with educator, project, segment, language, model, voice, characters, credits, retry flag and output asset.

## 7. Verification checklist after deploying

1. `/` shows **Educator Studio** instead of Admin Login; `/admin/login` still works.
2. `/studio` → login → landing page; `/admin/studio` lists users.
3. Create an educator user, sign in as them: `/admin` redirects to `/studio`.
4. Content manager: Master Templates → New → upload an image in the Layout Editor (verifies bucket CORS + signed uploads).
5. Educator: New Localization → Translate Entire Lesson (verifies `OPENAI_API_KEY`) → Record a segment → timeline updates.
6. Review & Generate → Generate Video → the worker log shows the job → **Video Ready** → Approve → Publish → the resource appears under `/resources/<language>/…`.

## 8. Running the checks locally

```bash
npm run test:studio                      # timing engine, alignment matcher, layouts
npx tsx scripts/studio-dev-seed.ts       # give the seeded admin AI Voice credits
STUDIO_MEDIA_DIR=<folder with imgA.png imgB.jpg clipC.mp4 narr7.wav music.mp3 cookie.txt> node scripts/studio-e2e/run.mjs
```

`scripts/studio-e2e/run.mjs` performs the full pipeline against a running dev server (uploads → template → project → translations → mock AI voice → 7-second upload for segment 3 → timeline ripple check → DOCX export → render) and prints the timeline before/after, which is the V1 acceptance test from the brief. `npx tsx scripts/studio-e2e/session-cookie.mts` prints a session cookie for it.


## 6. Shipping prepared lessons to the site

Master templates are prepared on a machine with FFmpeg and the original videos (the local app, SQLite + `storage/studio/`). `scripts/studio-sync-production.ts` copies a playlist's lessons — videos, templates, segments, media matches, assets and their files — to production with the same ids:

```bash
# 1. on the preparing machine (local .env)
npx tsx scripts/studio-sync-production.ts export --playlist "Marketplace Literacy Youth Africa" --out sync/youth-africa

# 2. against production (values from the Netlify site: netlify env:get <NAME> --site c4c93f37-…)
DATABASE_URL=… DIRECT_URL=… STUDIO_STORAGE_DRIVER=s3 STUDIO_S3_ENDPOINT=… STUDIO_S3_REGION=… STUDIO_S3_BUCKET=… STUDIO_S3_ACCESS_KEY_ID=… STUDIO_S3_SECRET_ACCESS_KEY=… STUDIO_S3_PUBLIC_URL=… npx tsx scripts/studio-sync-production.ts import --bundle sync/youth-africa --set-main
```

`--dry-run` connects and reports what would change without writing. The import generates a Postgres client into `node_modules/.prisma/client-postgres`, so the local SQLite client keeps working. Re-running skips files already in the bucket and upserts rows. The Youth Africa bundle is 772 files / 806 MB (25 master videos ≤ 47 MB each, under the 50 MB Supabase object limit).

**Status 2026-09-22:** code deployed (`da95257`), studio tables created on the production Postgres (`prisma db push`, additive). The Supabase bucket is configured on Netlify (`STUDIO_S3_ENDPOINT/BUCKET/PUBLIC_URL`) but `STUDIO_S3_ACCESS_KEY_ID` / `STUDIO_S3_SECRET_ACCESS_KEY` are empty, so neither the content import nor in-app uploads (narration, assets) work on the site until the bucket keys are set (Supabase → Project Settings → Storage → S3 access keys). `OPENAI_API_KEY` / `ELEVENLABS_API_KEY` are also empty (translation and AI voice disabled with a friendly message).
