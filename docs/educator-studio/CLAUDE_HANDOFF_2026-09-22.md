# Marketplace Literacy Educator Studio — handoff for Claude

**Checkpoint:** 22 September 2026, after the on-screen text feature. This is a continuation of the existing Marketplace Literacy Video Library, not a new app. The immediate goal is a working, understandable Studio that the MLP team can demonstrate; polish and infrastructure hardening can follow. This file describes the state observed at this checkpoint, not a promise that all external services remain healthy later.

## Start here and protect the worktree

- Repository: `C:\Users\uwish\Documents\Codex\2026-05-05\mlp-video-library`
- Git: `main`, `https://github.com/MLP-Subsistence/mlp-video-library.git`; local `HEAD` and `origin/main` both pointed to `9c530b81c0659c5c618220f74436c28fbd175fda` when this was written.
- Production site: <https://marketplaceliteracyapp.org/> on Netlify, site name `mlp-videolibrary` (site ID `c4c93f37-3d43-4bbd-8bb7-37b633a7c039`). `/studio` is Educator Studio; `/admin` stays staff/admin-only.
- First inspect `git status -sb`, `git log -5 --oneline`, applicable `AGENTS.md`, and the code before changing anything. Do not reset, clean, stash, or stage the owner's other work.
- The checkout was **dirty but in sync with the remote**. `electron/main.cjs` was modified; `.idea/`, `android/`, `deliverables/`, many `docs/ios/` and `docs/native/` files, Electron/native assets, `CHATGPT_THREAD_HANDOFF.md`, `MLP_APP_GPT_HANDOFF.md`, `build-check.log`, and `tsconfig.tsbuildinfo` were untracked. These are unrelated to Studio and must be preserved. This handoff itself is an additional uncommitted document; it has not been pushed.

The older `docs/educator-studio/HANDOFF_FOR_CODEX.md` records the *first implementation pass* and contains obsolete statements (for example, that six Studio commits were still unpushed). `DEPLOYMENT.md` mixes valid architecture with a dated provider-key status. Use them for background, but check current code, deployment, and secrets' **presence** before relying on operational claims. Never print or put credential values in a handoff, issue, or commit.

## Product and non-negotiable behavior

Educator Studio allows a non-technical educator to localize an existing MLP lesson. A master template contains stable, ordered segments with source script and visual compositions. A localization project selects a template and target language, then stores each segment's translated narration script, recorded/uploaded/AI-generated audio, and visual/timing overrides. Educators review and generate a final lesson. The public video/resource library and MLP visual identity must remain intact: navy/deep slate, brick-orange actions, white surfaces, light-gray background; no generic new SaaS design language.

**Audio is the timing authority.** Segment duration incorporates narration plus optional quiet time before/after. Visuals hold or stretch to that duration, and later segments shift automatically. The synchronized timeline shows text, video, and audio and clicking a block selects its segment. The user asked to remove the *music track from the editing UI*; the renderer still supports optional template music, so do not confuse the hidden timeline track with removal of that backend feature. Undo/Ctrl+Z protects edits. Do not turn this into a complex Premiere-style editor.

Other required capabilities: OpenAI-assisted translation; direct microphone recording and audio upload; full-length narration import/alignment; ElevenLabs AI Voice with internal educator/global credit limits; shared asset management and video-specific original-photo folders; multi-visual layouts; 720p and 1080p export; staff-only `/admin` management. Keep the narration translation separate from any words overlaid on screen.

## Architecture and code map

The app is Next.js App Router + React + TypeScript, Prisma 5, and Netlify. `prisma/schema.prisma` is local SQLite; `prisma/schema.postgres.prisma` is production Postgres. Schema changes must be reflected in both. Netlify runs the web app, but FFmpeg rendering and full-narration alignment require a **separate worker** (`npm.cmd run worker`) with database, storage, and FFmpeg access. `scripts/netlify-build.mjs` intentionally skips database setup unless `RUN_DATABASE_SETUP=true`.

| Concern | Main implementation |
| --- | --- |
| Studio auth/roles and staff separation | `src/lib/auth.ts`, `src/lib/roles.ts`, `src/lib/studio/access.ts`, `src/proxy.ts` |
| Master/project data and shared DTO | `prisma/schema*.prisma`, `src/lib/studio/types.ts`, `src/lib/studio/project-state.ts` |
| Segment timing and undo | `src/lib/studio/timing.ts`, `src/lib/studio/undo.ts`, `src/app/api/studio/projects/[id]/segments/[segmentId]/route.ts` |
| Workspace, preview, timeline, script panel | `src/components/studio/workspace/` |
| Layouts and on-screen text validation | `src/lib/studio/layouts.ts`, `src/lib/studio/text-overlay.ts` |
| Translation, voice credits, alignment | `src/lib/studio/services/` |
| Uploads and asset folders | `src/lib/studio/storage.ts`, `src/lib/studio/verified-original-video-map.json`, `src/app/api/studio/assets/` |
| Render and alignment worker | `src/worker/index.ts`, `src/worker/render.ts`, `src/worker/text-overlay.ts`, `src/worker/align.ts` |
| Deployment/operations | `netlify.toml`, `docs/educator-studio/DEPLOYMENT.md` |

Supabase is used for production Postgres and S3-compatible Studio object storage, **not** Supabase Auth. The user chose the existing Subsistence/DemoKaam-related Supabase account rather than a new storage provider. The production import previously reported 25 Youth Africa videos/templates and 430 segments. Recheck the live project and storage before asserting current counts or health. Keep OpenAI, ElevenLabs, Supabase S3, database, and session secrets server-side/protected; never expose them in client code or logs.

## What is implemented and where we stopped

The current `main` includes segment localization, the synchronized timeline, before/after-voice pacing, visual selection and multi-visual layouts, Ctrl+Z undo, translation and narration UI, full narration import path, AI Voice/credit infrastructure, asset library, video-specific folders, and generation/review flow. The latest commits are:

```text
9c530b8 Add draggable on-screen text controls to Educator Studio
ac1c084 Add visually verified original photo matches from exception review
3376b29 Audit Shutterstock originals against lesson frames for video folders
7637b17 Add verified-original production sync tooling
66e8cf9 Add video folders, timeline text editor, and safe undo
```

**Latest completed feature:** the text track now has an on-screen text editor inside the right-side Script & Narration panel's **Visual** section (`text-controls.tsx`). Educators can enter text, select Arial/Georgia/Verdana/Trebuchet MS, set size (16–120), color, left/center/right alignment, bold, readable dark background, and reset placement. Text appears in the central video preview; drag it to move and drag its corner to resize. Timeline text blocks lead to these controls. `Composition.textOverlay` persists in the existing composition-override JSON, so this change required no database migration. Switching layouts or reverting a visual to the template preserves the user's text. `src/worker/text-overlay.ts` renders the text into export frames; `src/worker/render.ts` composites it into the video. Translation/narration text stays independent.

**Original-photo folders:** the source is read-only: `C:\Users\uwish\Documents\MLP AFRICA PROJECTS\MLP AFRICA ASSETS\High Quality Shutterstock`. Only verified originals, not video screengrabs, belong in the 25 lesson folders in both Asset Library and Change Visual. The checked-in mapping is `src/lib/studio/verified-original-video-map.json`. `docs/educator-studio/ORIGINAL_IMAGE_FOLDER_AUDIT.md` explains the frame-matching method and remaining uncertainty. The audit considered 250 distinct originals and 430 saved reference frames, producing 395 video/photo memberships involving 208 distinct originals; unmatched verified originals remain in **All verified originals**, not guessed into folders. The user caught two omissions—`shutterstock_1142898902.jpg` and `1866006859`—in **1-Introduction to Marketplace Literacy**; both are now included. Three more were recovered by visual review (`1673607604`, `150377594`, `230434399`). Folder membership does not imply every possible match was found; inspect frame evidence for further claims. Scripts are under `scripts/audit-original-folders.ts`, `scripts/audit-originals-sift.py`, and `scripts/review-original-folder-exceptions.py`.

**Release/verification at this checkpoint:** `9c530b8` was pushed to `origin/main` and a Netlify deployment was reported ready/published on 22 September 2026 (deploy ID `6ab2963aa30db300085ea41f`). The current turn re-ran `npm.cmd run test:studio`: **32/32 passed**. The previous implementation turn reported a passing TypeScript check/build and a local FFmpeg 720p smoke render of a one-second clip with on-screen text. Those checks establish local implementation confidence, not a complete live educator-to-export acceptance test. The production FFmpeg worker was **not confirmed running**; queued render/alignment jobs may remain unprocessed. Reconfirm production deploy status, authenticated routes, provider settings, and a real generated video before saying the entire workflow is working end-to-end.

## Most recent design direction — proposed, not yet implemented

After seeing the current workspace, the user said it looks messy and overwhelming and requested a cleaner, professional layout explanation for FlutterFlow Designer. A design prompt was delivered in the conversation; **no FlutterFlow design file and no corresponding UI redesign have been applied to this repo**. The desired simplification is:

- A compact top bar with lesson/language/progress and one clear primary action; move bulk actions into a restrained menu or contextual location.
- A narrow, collapsible segment list at left; a generous video preview in the center.
- Right-side controls grouped into easy-to-find, short tabs or sections (Script, Voice, Visuals & Text, Timing), rather than one long scrolling form.
- A compact/collapsible synchronized timeline below the preview, visible when needed; fewer duplicate buttons and warning badges. Keep segment selection, undo, text editing, and pacing discoverable.
- One obvious **Approve & Next Segment** action and human-readable readiness cues; maintain the existing MLP colors/components and responsive behavior.

Treat this as design intent for the next UI iteration, not as a completed feature. Do not rebuild the workflow or remove existing capabilities to achieve visual simplicity. The immediate user request here is a handoff, **not authorization to implement or deploy that redesign**.

## Workspace clean-up and the rich text inspector (implemented 22 September 2026, local only)

The design intent above is now code, in the existing components — no rebuild, no capability removed:

- **Top bar:** title, language, readiness, then only Undo (icon), Preview lesson, a **Lesson tools** menu (translate entire lesson, import full narration, translation settings — `ActionMenu`/`MenuItem` in `ui.tsx`) and the single primary **Review & Generate**.
- **Right panel:** four short tabs — **Script / Voice / Visuals / Timing** — instead of one long form, with a dot on a tab that still needs attention and **Approve & Next Segment** pinned at the bottom. The tab is lifted into `workspace.tsx` so the timeline's text blocks can jump straight to Visuals.
- **Preview:** one row (Preview segment · Around · hide), because Layout/Change visual now live in the Visuals tab; the duplicated warning banner is gone (warnings stay on the timeline block and under the approve button).
- **Timeline:** Undo and "Edit text" removed from the toolbar; empty text blocks and repeated "No narration" labels no longer shout; only the selected block shows the full warning badge, the others a small dot. The toolbar wraps instead of overlapping on narrow columns.
- **Sidebar:** the studio sidebar's bottom links flow after the nav (`mt-auto`) instead of being pinned over it.

**On-screen text is now a Resolve-style inspector** (`text-controls.tsx`, `src/lib/studio/text-overlay.ts`): 9 fonts, size 8–200, bold/italic/underline/UPPERCASE, horizontal **and** vertical alignment, letter spacing, line spacing, rotation, text opacity, background plate (colour/opacity/corner rounding), outline (width/colour), drop shadow (colour/blur/offset X/Y/opacity) and five one-click presets (Subtitle, Big title, Lower third, Outlined, Corner note). Sizes are expressed for a 1080p frame and scale for 720p. `TextOverlay` gained optional fields only, so stored segments keep working; `normalizeTextOverlay` clamps everything and fills defaults. The preview applies the same styling in CSS and `src/worker/text-overlay.ts` draws it into the export SVG (`paint-order` outline, `feDropShadow`, rotation, vertical anchoring). `scripts/studio-e2e/text-demo.mts` renders every preset over a real lesson photo through the export path for eyeballing.

Checks: `npx tsc --noEmit` clean, `npx eslint src` clean (including two pre-existing React-hooks errors that are now fixed), `npm run test:studio` 34/34.

**Timeline clips and the text plate (same day, follow-up):** each segment now has three selectable clips — **text, video, audio** — and clicking one both selects the segment and opens that clip's settings on the right (audio → Voice tab with the narration card ringed; video → Visuals with the visual card ringed; text → Visuals with the on-screen text card ringed and scrolled into view). The selected clip is outlined, the segment's other two clips stay tinted, and durations remain audio-led and shared, exactly as before. The in-block **Change / Layout / Edit text** buttons were removed as distracting. The text's drag box and resize handle only appear while the **text** clip is selected, so with the video or audio clip selected the preview shows the finished frame. The text background plate now hugs the words (and each wrapped line) instead of filling the whole text box, in the preview (`box-decoration-break: clone`) and in the export (one rect per line in `src/worker/text-overlay.ts`).

## Remaining work and manual/operational gates

1. **Production worker:** identify a persistent host with Node/FFmpeg/FFprobe, production DB and bucket configuration; start `npm.cmd run worker` (or an equivalent managed service), then verify an actual queued render and full-narration alignment. Netlify itself cannot do FFmpeg work. `C:\ffmpeg\bin\ffmpeg.exe` was available locally, but local availability is not production worker availability.
2. **Providers:** inspect current protected Netlify environment settings and `/admin/studio` provider configuration without exposing values. The user previously authorized an OpenAI project-scoped service-account key and ElevenLabs key rotation. Do **not** infer from older docs that keys are absent or operational; test one low-cost translation and one short AI Voice output, confirm credits decrement, and confirm the old exposed ElevenLabs key is revoked. Any new keys must remain protected server-side.
3. **Live smoke test:** use an educator account to check login, lesson selection, matched asset folders, translation, short recording, on-screen text drag/resize, Ctrl+Z, timing ripple, 720p/1080p output, approval and publication boundaries. Distinguish UI/local tests from actual production tests.
4. **Clean UI iteration:** review the FlutterFlow Designer prompt and current workspace with the user/team, then implement a smaller-disclosure layout in the existing components if requested. Preserve `/admin` roles and all workflow behavior. Avoid duplicating actions across the header, preview, timeline, and right rail.
5. **Match audit:** additional low-confidence original-photo matches may exist. Use evidence from saved source frames, not filenames or thumbnails alone; keep screengrabs out of verified-original folders.

## Safe continuation commands (PowerShell)

From the repository path above:

```powershell
git status -sb
git log -5 --oneline
npm.cmd run test:studio
npx.cmd tsc --noEmit
npm.cmd run build
```

Run the heavier build only when appropriate; check the worktree and active dev server first. Use `.cmd` launchers on Windows. Read `docs/educator-studio/ARCHITECTURE_AUDIT.md`, `MEDIA_LIBRARY.md`, `ORIGINAL_IMAGE_FOLDER_AUDIT.md`, and the current code for detail. For deployment, verify the actual Netlify site/branch before pushing; a push to `main` can change the live site. Never commit `.env`, service keys, private media, local build output, or unrelated native-app work.

**Bottom line:** the Studio is implemented in the live app and the latest on-screen text feature has local automated/render evidence. The team-demo path is close, but a verified production worker/provider/end-to-end pass is still the key operational gap. The cleaner workspace is a design brief awaiting implementation, not part of the current release.
