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
