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

**Pie layout (replaces the circle collage):** `pie2`…`pie8` cut one circle into equal slices, each slice a media slot; the count is picked from a row of 2–8 buttons ("How many slices make up the circle?") on a single **Pie Chart** card. Slices never touch: each one is inset by `PIE_GAP` along both straight edges, which keeps the gap the same width from the rim inwards and trims the point, leaving a small hole in the middle. A slice is stored as the bounding box of its wedge plus a polygon in that box (`LayoutSlotRect.clip`), so the browser clips it with `clip-path: polygon(...)` (`clipPathForSlot`) and the worker bakes the identical polygon into an alpha mask (`writePolygonMask` + FFmpeg `alphamerge`). The old `circles2…6` ids are kept out of the picker but still resolve, so any segment saved with a circle collage keeps rendering. `scripts/studio-e2e/pie-demo.mts <slices>` composites a pie from real photos the way the renderer masks it.

**AI Voice page — subpages and the credit-free ElevenLabs features:** `/studio/projects/<id>/voice` is now five tabs — **Voices, Voice library, Clone a voice, Settings, Segments** — with credits, the localization summary and the language context in the sidebar.

- *Voices*: the account's voices with search and preview; cloned voices can be removed (refused while a localization still uses them).
- *Voice library*: searches the provider's public voices (`GET /v1/shared-voices`) with the provider's own filters — language, voice (gender), age, best-for (use case), quality (category) and accent (with a suggestion list) — plays their samples and copies one into the MLP account (`POST /v1/voices/add/{owner}/{voice}`). Content managers/admins only. When no provider is connected the tab says so and points at `/admin/studio` instead of reporting "no voices matched".
- *Clone a voice*: instant cloning from uploaded recordings (`POST /v1/voices/add`, multipart, up to 8 files / 40 MB, optional noise removal). The samples go straight to the provider and are not stored by the studio. Content managers/admins only, and the button stays disabled unless the plan reports `can_use_instant_voice_cloning`.
- *Settings*: the four voice sliders plus a **per-localization model** (stored inside the existing `voiceSettings` JSON — no migration; the renderer and ledger use it) and a read-only account panel (plan, provider characters, voice slots, cloning availability) from `GET /v1/user/subscription` and `GET /v1/models`.

None of these calls spend narration credits — only generating narration does, which the sidebar now says out loud. New routes: `GET/POST /api/studio/voice/library`, `POST /api/studio/voice/clone`, `GET /api/studio/voice/account`, `DELETE /api/studio/voice/voices/[voiceId]`; new optional `VoiceProvider` methods keep the mock provider working offline (it returns empty/disabled results with friendly messages).

**Personal work, shared samples:** master templates stay visible to everyone, but a localization project is now visible only to the account that created it (`projectWhereForUser`) — previously content managers saw everyone's. Administrators keep full visibility for support, since they already manage users, jobs and credits in `/admin`.

## AI Voice page rebuild — ElevenLabs feature parity (23 September 2026)

The AI Voice page (`src/components/studio/voice-page.tsx`) now has six tabs: **My Voices, Explore, Create voice, History, Settings, Segments**, matching the ElevenLabs screenshots the owner supplied.

- **My Voices** (was "Voices"): search plus one-click category pills (Conversational, Narration, Characters, Social Media, Educational, Advertisement, Entertainment).
- **Explore** (was "Voice library"): a searchable language dropdown (`LanguageCombobox`, `src/lib/studio/elevenlabs-languages.ts` — ElevenLabs' real ~29 v2 languages plus a v3-only extension, explicitly *not* the GPT catalog below), a "Filters" popover (Quality/Gender/Age/Accent, matching the ElevenLabs filter panel), and the same category pills. All free — nothing is added to the account until "Add".
- **Create voice**: two method cards, matching the ElevenLabs "Create voice" modal — **Instant Voice Clone** (existing) and new **Voice Design** (text-to-voice: describe a voice, generate a few candidates via `POST /v1/text-to-voice/create-previews`, listen to base64 previews client-side, save one via `POST /v1/text-to-voice/create-voice-from-preview`). Professional Voice Clone and Voice Remixing are named but intentionally **not implemented** — noted as available directly in the ElevenLabs dashboard — rather than shipping a half-working version of a feature that needs manual verification/a different plan tier.
- **History** (new): every `StudioVoiceUsage` ledger row for this localization, newest first, grouped by day like the ElevenLabs History tab, with search + Voice/Model/Status filters. `GET /api/studio/projects/[id]/voice/history` (`voiceHistory()` in `services/voice.ts`) joins the ledger to `StudioProjectSegment` — note `StudioVoiceUsage.segmentId` stores the **StudioProjectSegment id**, not the master `StudioSegment` id (no Prisma relation either way, since a ledger row must outlive a deleted segment).
- **Settings**: rebuilt to match the ElevenLabs panel — Voice and Model as real dropdowns (not read-only text), the four sliders with ElevenLabs' own min/max labels (Slower/Faster, More variable/More stable, Low/High, None/Exaggerated), a **Language Override** toggle (only enabled for models that accept `language_code` — Flash/Turbo/v3, gated by `modelSupportsLanguageOverride()`), and the existing provider-account panel.

**Two new provider capabilities**, both free of narration credits: `designVoice` / `saveDesignedVoice` on `VoiceProvider` (`voice-providers.ts`), and `language_code` passed through `synthesize()` only when the model supports it (sending it to `eleven_multilingual_v2` is a 422).

**Text-translation language catalog** (`src/lib/studio/language-catalog.ts`): the owner's attached "GPT Text Translation Language Catalog" document (343 languages, 10 regions, Strong/Good-Practical/Experimental-Verify tiers) parsed losslessly from the docx's own table XML (not regex over flattened text, which is ambiguous once cell boundaries are gone) into a typed array. **Important distinction the source document itself makes**: this catalog is for *written GPT text-to-text translation* (the Translate step, `gpt-4.1-mini`) and explicitly excludes transcription, speech recognition and text-to-speech. It is **not** an ElevenLabs voice-language list — applying its tiers to which voices to show would be wrong, so it isn't used for the Explore tab's language filter (that uses the real, much shorter `elevenlabs-languages.ts` list instead). It's used for a "Text translation support" card, shown on the AI Voice page's sidebar and Settings tab, labelled for the target language (e.g. Kinyarwanda → Good — practical) — exactly the tier concept the document defines, applied to the step it actually describes.

Checks: `npx tsc --noEmit` clean, `npx eslint src` clean, `npm run test:studio` 36/36. Verified in the browser: all six tabs render, Explore's "no provider connected" state still shows correctly, Create voice's method cards switch, History's empty state, Settings' disabled Language Override on the placeholder model, and the Kinyarwanda "Good — practical" translation-tier card.

## App-wide cleanup: icon/text collisions, Voice Library split, wizard/library disclosure (23 September 2026)

Triggered by the owner flagging a search box where the search icon overlapped the placeholder text, and asking for a broader "clean, clear, easy to use platform for non-tech savvy people" pass across Educator Studio.

**Icon/text collision (7 sites).** Root cause: `.mlp-input { padding: 0 14px; }` in `globals.css` is a plain rule after `@import "tailwindcss"`, so at equal specificity it always wins the cascade over a combined `pl-10` utility on the same element — the icon (absolutely positioned) and the input's own left padding fought, and the icon usually won, sitting on top of the first character(s). Fixed by restructuring every affected search/login field from "icon absolutely positioned over a separately-padded input" to icon-and-input as **flex siblings** inside the `.mlp-input` wrapper (icon gets normal flex layout, no absolute positioning, no padding hack needed): `src/app/studio/login/page.tsx`, `src/app/admin/login/page.tsx`, `src/components/studio/asset-library.tsx` (the shared asset-picker modal, so this one fix also covers Layout Editor's and Change Visual's asset pickers), `src/components/studio/assets-page.tsx`, `src/components/studio/templates-page.tsx`, plus the two new search boxes in `voice-library-page.tsx`. Added `.mlp-input:focus-within` next to the existing `.mlp-input:focus` in `globals.css` so the wrapper still shows a focus ring when the `<input>` inside it is focused.

**`window.prompt()` → inline editing (Asset Library).** Renaming an asset or editing its tags used `window.prompt()` — a native browser dialog with no styling, no validation, and a jarring modal-over-modal feel. `src/components/studio/assets-page.tsx`: `rename()`/`tag()` now take the new value directly; the asset card's name and tags are real inline `<input>` fields (save on blur, `Enter` blurs) styled to look like text until focused.

**Asset Library folder browser collapsed by default.** The "Browse by video" folder list auto-selected and displayed the first folder's contents on page load, which is a lot of visual weight for a browse feature most sessions don't use immediately. It's now a collapsed `<details>`-style section (`foldersOpen` state, starts closed) the user opens deliberately; `folderId` starts `null` instead of auto-picking the first folder.

**New Localization wizard's language step trimmed.** Region / Variety / Register were three more fields shown unconditionally alongside Language and Audience. Region and Variety only matter for a handful of languages; Register is a fine-tuning knob most lessons don't need. `src/components/studio/projects-page.tsx`: the step now shows Language + Audience (+ Language name for a custom language) up front, with Region/Variety/Register behind a "More options" `<details>` disclosure.

**Voice Library page split (the largest item).** The AI Voice page had grown to six tabs (My Voices, Explore, Create voice, History, Settings, Segments) — most of that content is account-wide (which voices exist, browsing the provider's public library, cloning/designing new ones, the provider's plan limits), not specific to the one localization the page lives under, and the account's own Settings tab duplicated the "Text translation support" card and the "Provider account" panel that already appeared in the sidebar. Split into:
- **`src/components/studio/voice-library-page.tsx`** (new) — account-wide **Voice Library**: My Voices / Explore / Create voice, gated the same way as Master Templates and Asset Library (`canManageTemplates`), routed at **`/studio/voices`** (`src/app/studio/(protected)/voices/page.tsx`) and added to `studio-shell.tsx`'s Content Management nav section (`Library` icon). Owns the "Provider account" panel (plan, character/voice usage, cloning availability) since that's account-wide, not per-project.
- **`src/components/studio/voice-page.tsx`** (trimmed) — now **Voice / History / Settings / Segments**, 4 tabs. The Voice tab still picks/searches/previews from the account's voices but no longer deletes them (deleting a voice is an account-wide action, now Voice-Library-only) and links out ("Manage voices, clone or design new ones →") to `/studio/voices` for managers, with a muted "ask a content manager" note for everyone else. Settings dropped the duplicated Text-translation-support card (kept only in the page's sidebar) and shrank "Provider account" to a one-line pointer at the Voice Library page instead of repeating the full plan/usage panel.

Checks: `npx tsc --noEmit` clean, `npx eslint` clean on every changed file, `npm run test:studio` 36/36 (no regressions — this work didn't touch timeline/render/transcript logic). Verified in the browser: `/studio/voices` shows all three tabs (My Voices with the two placeholder voices, Explore's "no provider connected" state, Create voice's two method cards) and appears correctly in the sidebar nav under Content Management; a project's `/studio/projects/[id]/voice` now shows exactly Voice/History/Settings/Segments with the "Manage voices" link, and Settings shows the Text-translation-support card and Provider-account line exactly once each (previously twice).

## Studio never points at /admin; styled delete confirmations (23 September 2026)

Owner rule: Educator Studio users should never see admin options. The header/menu "Admin" shortcut was removed (`studio-shell.tsx`, `canAccessAdmin` no longer passed to the shell). Every remaining `/admin` reference in Studio UI and in Studio service error messages (`voice-library-page.tsx`, `voice-page.tsx`, `services/voice-providers.ts`, `services/voice.ts`) now reads "Ask an MLP administrator…" instead of linking to or naming `/admin/studio`. Studio logout moved to its own `GET /studio/logout` (`src/app/studio/logout/route.ts`, lands on `/studio/login`); `src/proxy.ts` exempts it so a signed-out visit isn't bounced through login with `?next=/studio/logout`. Developer wording ("development only", "placeholder voice (development)", plan tier "development") replaced with plain "Voices aren't set up yet" copy.

All five Studio `window.confirm()` deletes (project, asset in the picker drawer and on the Asset Library page, template segment, whole template) now use `useConfirm()` from `ui.tsx`: `const [confirm, confirmDialog] = useConfirm();` render `{confirmDialog}` once, then `if (!(await confirm({ title, message })) return;`. The dialog listens for Escape in the capture phase and stops propagation, so over the asset-picker drawer Escape closes only the dialog (verified in the browser). The admin portal's own `confirm-delete-button.tsx` was left as is.

## Language picker with flags, one-at-a-time voice previews, public-site reflow (23 September 2026)

**Translation language picker.** `src/components/studio/language-picker.tsx` (`LanguagePicker`, `RegionPicker`, `Flag`) searches the 343-language GPT translation catalog (`language-catalog.ts`) by name, native name or country, grouped by the catalog's 10 regions under a "Used most at MLP" group, with each language's catalog quality tier. Flags come from `src/lib/studio/countries.ts`: a country list plus `countriesInText()`, which reads the catalog's free-text region ("Northern Uganda and South Sudan" → ug, ss; longest names first so "Guinea-Bissau" beats "Guinea" and "South Sudan" beats "Sudan"). The 21 broad regions (Levant, Worldwide, Western Europe, Tibet, Korean Peninsula…) deliberately get a globe, not a guessed flag. Flag SVGs are copied (212 files, 1.7 MB, MIT licence alongside) from the `flag-icons` package into `public/flags/` and loaded as lazy `<img>`s. The package is **not** a dependency: its CSS would have fetched most of the 2.4 MB set as soon as the list opened, and Windows can't show emoji flags.

Used in three places: Translation settings (new "Translate into" field at the top), the New Localization wizard (replaces the 35-language dropdown plus the "Another language…" box; free text is still possible via "Use '…' as the language"), and as flag chips on the Script tab's "Translation —" heading, the workspace header badge and project cards (chip and badge open Translation settings).

**Changing a localization's language never discards work.** `PATCH /api/studio/projects/[id]` now accepts `targetLanguageCode`/`targetLanguageName`, but returns 409 once any segment has a translation or narration. In that case the dialog explains this and its button becomes "Start {language} localization", which creates a separate project from the same template via the normal `POST /api/studio/projects`. `undo.ts` `PROJECT_FIELDS` now includes the two language fields, so undo restores a language change. Undo tokens issued before this deploy no longer match (they fail with a 409 "changed again"); they're per-session, so this only affects anyone mid-session at deploy time.

**Voice previews.** `src/lib/studio/preview-player.ts` is a single shared player: pressing a playing voice stops it, and starting another stops the first. `components/studio/audio-preview.tsx` holds the hook and the `PreviewButton` (play/pause/loading), used on My Voices, Explore, Voice Design candidates and the project Voice tab. Native players marked `data-exclusive-audio` (generation History rows, the Script tab's narration player) pause each other and stop previews. The Script tab's full-length "Listen to the original" `<audio>` bar (which showed the whole master's duration, e.g. 0:00 / 1:03 for a 1-second line, and overflowed the panel) is now a one-button play/stop of just that segment's slice. Explore's Filters popover and language dropdown close on an outside click or Escape. Tests: `__tests__/preview-player.test.ts`.

**Timeline.** Clip titles and "No narration" only render when the clip is wide enough to read them (previously a 1.4-second clip showed stray letters like "RAT").

**Public site reflow on zoom/wide screens.** `.mlp-container` keeps growing past 1440px (`max(min(1280px, 100% - 72px), 100% - 12vw)`) instead of stopping at 1280px, and card grids use `.mlp-card-grid` (`repeat(auto-fit, minmax(min(100%, var(--card-min, 340px)), 1fr))`, items capped at 2× `--card-min`). Result: 1 column on phones and 3 on laptops as before, 4 at 1920, 7–12 when zoomed out, and a short list fills the row. `.mlp-page` is a flex column and `PublicFooter` renders a growing spacer, so the footer sits at the bottom of short pages; privacy, terms and help moved onto `.mlp-page` (privacy and terms stay `max-w-5xl` for readable lines). The clip page's player is capped at `(100vh - 11rem) × 16/9` wide so it never gets taller than the window. The desktop app loads the live site, so this reaches it without an app rebuild. Measured with iframes at 375/1280/1920/4000 px on every public page: no horizontal scroll anywhere, footer gap 0 in a tall window.

## Clearer workspace buttons, lesson preview joins one-at-a-time playback, admin delete dialog (23 September 2026)

- **Workspace labels** (`workspace.tsx`): the icon-only undo button now reads "Undo"; "Around" is "Hear in context" and switches to "Stop" while that range plays (it previously couldn't be stopped from its own button); the unlabelled "^" is "Hide preview". "Preview segment" and "Preview lesson" each stop only their own playback. Before, they paused whatever was playing while still showing a play icon. `PlayRange` gained `kind: "segment" | "context"` instead of matching on the label text.
- **Lesson preview vs. other sound**: `preview-player.ts` gained `registerExternalPlayer()`. `use-player.ts` registers its `stop`, so starting a voice sample, a recording or the original clip stops the lesson preview. Starting the lesson preview calls `stopPreview()` + `pauseOtherAudio(null, itself)` to silence everything else without stopping itself. Covered in `__tests__/preview-player.test.ts`.
- **Admin portal** `confirm-delete-button.tsx` uses the Studio's `useConfirm()` dialog instead of `window.confirm`. It holds the submit, asks, then calls `form.requestSubmit(button)` so the server action and the button's name/value are exactly what a plain click sends. A two-sentence message is split at the first "? " into title and detail. With this, no `window.confirm/alert/prompt` remains anywhere in `src`.

## Studio density: 80% scale on computer screens (23 September 2026)

The owner found the Studio "too zoomed in". Their preferred screenshot matched browser zoom at 80%. On screens ≥1024px, `html:has([data-studio-shell])` now sets `font-size: 13px` (globals.css; the attribute is on `StudioShell`'s root). Phones and tablets keep 16px for tapping, and the Studio login page and public site are unaffected.

For everything to scale together, the Studio's fixed pixel sizes became rem (px/16, so identical at 16px): the sidebar `w-/pl-[14.375rem]`, workspace `GRID_COLUMNS`, page grid columns, `calc(100vh-3.5rem)` (the header height), and `text-[15px]`/`[17px]`. The shared `.mlp-btn-*`, `.mlp-input`, `.mlp-badge`, `.mlp-soft-badge`, `.admin-sidebar-link` and `.mlp-drawer-link` classes also moved to rem. That leaves the public site and admin portal pixel-identical, because their root stays 16px. Media queries in rem still use the browser's 16px base, so breakpoints didn't move. The 10–11px timeline labels and the timeline's 64px track-label column stay in px on purpose.

`StudioPageHeader` no longer wraps on `lg+`: the title truncates (full title on hover) and the actions stay on one row. The preview buttons row wraps and centres. **Cascade gotcha, again:** `.mlp-btn-outline` sets `display` after Tailwind's layers, so `hidden` on the same element loses. "Hide preview" was showing (and doing nothing) on phones; it's now wrapped in `<span className="hidden lg:contents">`. No other element combines `hidden` with a class that sets `display`.

Checked with iframes at 1024/1280/1366/1536/1714/1920 px on the workspace, projects, Voice Library, AI Voice and Review pages: no horizontal scroll, and the workspace fills the window exactly.

## Translation quality, English meaning checks, recording, playback, full-recording splitter, Export (24 September 2026)

Owner feedback: GPT translations were poor ("…kumenya ibyerekeye marketplace"), no obvious export, preview playback inconsistent, "Test microphone" every segment, slow recording saves, no path for people who already have one recording for the whole video, and no way for someone who doesn't speak the target language to work on it. **No database changes in this batch** (live schema updates need `RUN_DATABASE_SETUP=true`, see `scripts/netlify-build.mjs`).

- **Translation** (`services/translation.ts`, `translate/route.ts`):
  - `translationModel()` upgrades the stored old default `gpt-4.1-mini` to `gpt-4.1`; any other admin-typed model is used as given.
  - Every request carries the whole lesson's English script.
  - The prompt forbids leftover English ("marketplace literacy" is an idea to translate, not a brand; only proper names stay English).
  - One call per batch returns a literal draft → final → `englishWordsLeft` self-check → English back-translation.
  - Batch size is 5 (from 8) to stay within function time limits.
  - Measured locally on the Youth Africa lesson: before, "marketplace literacy", "marketplace" and "entrepreneur" were left in English; after, it uses "gusobanukirwa isoko", "amasoko", "umucuruzi". A native speaker still needs to judge fluency.
  - `englishOverride` (single segment) translates the educator's own English wording.
- **English meaning check** (`workspace/meaning-check.tsx`, `meaning-cache.ts`, `api/.../back-translate`):
  - Under each translation: "In English", with matches/differs-from-original and the differences listed.
  - "Check what this says in English" re-checks edited text on demand.
  - "Change it in English" / "Write it in English and translate" lets a non-speaker edit.
  - Back-translations are cached in `localStorage`, keyed by segment and exact text, so any edit invalidates them.
- **Preview subtitles:** Off / English / target language, under the preview (`useSubtitleMode` in `workspace.tsx`, `subtitle` prop on `CompositionPreview`). Default is English; it's an editing aid only and never rendered into the video.
- **Recording** (`workspace/recorder.tsx`, `workspace/microphone.ts`):
  - One "Record" button; no mic test, no 1.5s wait.
  - The level meter shows while recording; silent/quiet/clipped takes are flagged after Stop.
  - One shared microphone stream stays warm across segments and is released 90s after no recorder is on screen.
  - Blocked mic, missing device and busy device each get a plain message.
- **Saving speed:**
  - `storageObjectExists()` now uses S3 `HeadObject` (`StorageDriver.exists`). Previously it did a full `GetObject` download of every upload just to check it existed — the main cost on the live site, which uses S3.
  - `uploadAsset({ measured })` skips decoding the recording a second time. Server-side project reload measured at ~4ms locally, so it isn't the bottleneck.
- **Preview playback** (`use-player.ts` rewrite):
  - Each narration file gets its own preloaded `<audio>`, and the next segment's file is preloaded.
  - The clock waits (up to 4s) for audio to actually play instead of running ahead. Before, it seeked into the file late, skipping each segment's first words by a varying amount.
  - A finished narration isn't `play()`ed again (that restarts it from 0).
  - `rangeRef` fixes stale range closures.
  - Verified: per-file lesson plays one `play()` per segment, each at 0.00; full-recording slices play from each cut and pause within ~30ms of the end.
- **Full-recording splitter** (`workspace/full-narration.tsx`, `lib/studio/narration-split.ts`, `api/.../full-narration/split`):
  - Replaces the worker/transcription import in the UI. That flow queued a job the live site has no worker to run, and depended on speech recognition that's weak for Kinyarwanda/Darija; its API route is still there.
  - Accepts an audio file, or a video (sound extracted in the browser to 24 kHz mono WAV).
  - First split "At the pauses" (loudness envelope → pauses → ordered DP choosing one cut per boundary near script-length expectations) or "Like the original video" (the master's `source` timing, scaled).
  - Coloured draggable bands on a waveform, ±0.1s nudges, per-segment and "play all" playback with the English line as a subtitle.
  - Saving sets every segment to `narrationSource: "full"`, ready, with its slice. `narrationScriptHash` is null when there's no text yet, so typing it later doesn't flag the audio.
  - Reached from Lesson tools → "Use one recording for the whole lesson" and from the Upload tab.
  - Tests: `__tests__/narration-split.test.ts`.
- **Export** menu (dark button, workspace header):
  - Video MP4 (when rendered).
  - Narration WAV (mixed in the browser with `OfflineAudioContext` at timeline positions).
  - Subtitles `.srt` in the target language and in English (cues timed to narration; `workspace/export.ts`, tested).
  - Script Word/PDF (existing route, `approved=0`).

Verified locally with a throwaway Arabic project (created, split a synthetic 4-part recording, saved, previewed, deleted). Real microphone recording was not possible in the browser pane (mic blocked there), so the Record flow needs a manual try in a normal browser.

## Whole-lesson voice-overs in any language (25 September 2026)

For educators who already have the whole lesson narrated in their language (e.g. an Arabic dub of "Introduction to Marketplace Literacy") and want the template's images to follow it. The template's segment count doesn't change with language; only where each segment starts in the recording has to be found, and the images then follow the audio automatically (each segment's image stays up for however long its line takes). **No database changes.**

- **Entry points:**
  - New Localization step 4, "Voice-over": *Segment by segment* or *I already have the whole voice-over*, optionally with the file picked right there. The file is handed over in memory (`workspace/pending-voiceover.ts`); the page opens with `?voiceover=1` → `Workspace openVoiceover`.
  - A workspace banner while no segment has narration ("Already have the whole voice-over in one file? Add whole voice-over").
  - Lesson tools → "Add whole voice-over".
  - The Upload tab link.
- **Four ways to find the segments** (`workspace/full-narration.tsx`):
  1. **Match the words** — default when OpenAI is configured and the language is in `speech-languages.ts` (Whisper's reliable list; Arabic, French, Spanish, Swahili, Hindi… but not Kinyarwanda/Luganda).
     - The browser sends ~2-minute 16 kHz WAV chunks, cut at pauses, to `POST /full-narration/listen?offset=` (under Netlify's body limit). That returns word timings.
     - `POST /full-narration/match` gets the words plus the pauses measured in the browser. `buildPhrasesFromPauses` cuts phrases at the measured pauses (Whisper's word times smear across pauses and rarely carry punctuation, so its own phrases straddled lines). The AI (`matchLinesToPhrases`, translation model) then picks the phrase each English line starts at, told the silence before each phrase. `repairStarts` enforces order.
  2. **At the pauses** (instant, any language).
  3. **Like the original video** (a dub recorded to the English timing).
  4. **Mark while listening:** one tap (or Space) per segment, starting with segment 1 so a spoken intro is excluded. Each tap snaps back to the longest pause that ended just before it (`snapCutsToPauses(…, "before")`), since taps come late and lines have micro-pauses in their first words.
- **Save:** optionally fills each *empty* segment text box with what was heard, as an AI draft (`heardText` on `full-narration/split`; existing text is never overwritten). The Script panel remounts after whole-lesson updates (`panelRevision` in `workspace.tsx`), which also fixes "Translate entire lesson" leaving the current segment's box stale.
- **Verified with a real Arabic voice-over, not synthetic tones.** 13 lines were translated and voiced with OpenAI TTS at varied speeds, with uneven pauses including two run-together lines and a spoken intro not in the script; true line starts were recorded.
  - Match the words: all 13 starts within 0.07s (identical on two runs); ~12s for 84s of audio in the app.
  - The first version (Whisper-gap phrases) missed 3 boundaries by 1.9–3.6s, which is what led to the measured-pause phrases.
  - Mark while listening, with taps 0.3–0.9s late: all 13 within 0.11s.
  - Save filled the right Arabic text per segment, and lesson preview in headless Chromium played each slice from its start to its end.
  - The throwaway project, test audio and served test file were removed.
- **New Localization wizard:** the lesson column now shrinks (`minmax(0,1fr)` + `min-w-0`) instead of widening the dialog so it scrolled sideways and cut off the playlists.
- **Cost:** matching the words calls Whisper (about $0.006 a minute) plus one AI call each time a voice-over is opened. It runs automatically on open for supported languages.

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
