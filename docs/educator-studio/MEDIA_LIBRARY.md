# Educator Studio — Media Library & Shutterstock

The original MLP lesson videos have burnt-in English captions, so a localized video needs the *clean* source image for each segment. Most of those images come from Shutterstock. The studio finds them automatically and lets a content manager swap them in.

## How it works (per master segment)

1. The master import stores a poster frame for every segment (`StudioSegment.frameAssetId`).
2. The studio crops the caption band (bottom 20 % by default, `STUDIO_CAPTION_CROP_FRACTION`).
3. **Find on Shutterstock** sends that crop to Shutterstock's reverse image search (`POST /v2/cv/images` → `GET /v2/cv/similar/images`) and shows the top 12 candidates (`StudioMediaMatch` rows).
4. The content manager picks the match:
   - **License & use** — when MLP has a Shutterstock *API subscription*, the studio licenses (`POST /v2/images/licenses`), downloads the file, stores it as an asset and makes it the segment's visual.
   - **Upload licensed file** — otherwise: open the match on shutterstock.com, license it with the MLP website subscription, upload the downloaded file; the studio attaches it and records which Shutterstock image it is.
5. **Use cropped frame** — fallback with no licensing at all: the caption-cropped frame becomes the visual (loses ~20 % of the height; cover-fit crops the sides a little).

Everything happens in `/studio/templates/<id>` under the segment preview ("Clean image for seg_NNN"). Localizations pick up the new visual automatically (they inherit the template composition unless a project overrode it).

## What MLP needs to provide

| | Where | Why |
| --- | --- | --- |
| `SHUTTERSTOCK_API_TOKEN` | shutterstock.com → Account → **Developers** → Create app → generate token; put it in Netlify env (and the worker/local `.env`) | Reverse image search. Works with any app token; no subscription needed for searching. |
| `SHUTTERSTOCK_SUBSCRIPTION_ID` | `GET https://api.shutterstock.com/v2/user/subscriptions` with the token, or ask Shutterstock sales | Licensing/downloading **through the API**. Shutterstock states that API subscriptions are a separate product: *"API subscriptions don't work on the Shutterstock web site"* and website subscriptions cannot license through the API. Without one, use the **Upload licensed file** path with the existing website subscription. |

Never paste the token into chat, code or the database; it is read from the environment only (`src/lib/studio/services/shutterstock.ts`).

Rate limits: Shutterstock returns 429 with a reset time when the per-minute quota is exceeded; the studio surfaces a friendly "try again in a minute" message. Searching one segment = 2 requests.

## Files

- `src/lib/studio/services/shutterstock.ts` — API adapter (search, subscriptions, license, download).
- `src/lib/studio/services/media-matches.ts` — crop, search, choose, license, fallback.
- `src/app/api/studio/templates/[id]/segments/[segmentId]/matches` (+ `/[matchId]`, `/clean-frame`).
- `src/components/studio/media-matches.tsx` — the panel in the template editor.
- `StudioMediaMatch` table (both Prisma schemas) — candidates, chosen/licensed match, licence id, resulting asset.

## Status (2026-09-22)

Built and verified locally without a token: the panel renders, the caption crop is correct (checked on lesson 1), "Use cropped frame" replaces the visual. The Shutterstock calls follow the official SDK's paths and bodies but have **not** been run against the live API yet — the first thing to do once the token exists is search one segment and confirm the candidate list looks right.

## Rule from the owner (2026-09-22)

**Never spend Shutterstock credits or money from this app.** Re-downloading images the account already licensed is free and allowed; licensing anything new is not, unless the owner explicitly says so (and that permission would cover credits only, never money). The API licensing path (`SHUTTERSTOCK_SUBSCRIPTION_ID`) therefore stays unset.

## Account library check (2026-09-22)

Using the signed-in account **367425665** (Madhu Viswanathan, "Unlimited Images + 50 GenAI Credits"), the Licensed Assets Library (`/catalog/licenses`) was exported — 1,687 images — via the site's own listing endpoint, and every public 600 px preview was perceptually hashed (`scripts/studio-media-library.ts index`). Matching all 609 master-segment frames against it (`… match`) found **no real matches** (best distances 12–14, i.e. noise; an identical pair scores ≤ 6). The library is Morocco/India-heavy and dated Dec 2022 – Sep 2026, so the images in the "Marketplace Literacy - Global" image-diary videos were licensed elsewhere (another Shutterstock account, or another source).

What that means:
- `index` / `match` / `ingest` work and are reusable: export another account's library the same way (open its Downloads page, run the small in-page script that saves `shutterstock-library-<userId>.json`), then `index --json … && match`, redownload the `needed-ids.json` images with the free **Redownload** button, and `ingest --downloads …` attaches them.
- Free **Redownload** on the website is `POST /napi/licensees/current/redownload` (triggered by the card's ⋯ → Redownload → Redownload); the file lands in the browser's Downloads as `shutterstock_<id>.jpg`. One image (2727785083) was redownloaded as a test.
- Until the right account is found, segments keep the original-video visual (captioned) or the **Use cropped frame** fallback.
