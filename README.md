# MLP Video Library

MLP Video Library is the Marketplace Literacy Project resource app for educators, facilitators, and learning programs. It stores resource metadata, local thumbnail paths, transcripts/scripts, and YouTube links. It does not download, upload, rehost, or store YouTube video files. Video resources play through embedded YouTube players.

## Public Structure

The public app is organized as:

```text
Language -> Resource Format -> Category -> Resource
```

Languages: English, French, Hindi, Spanish, Swahili, Telugu.

Resource formats: Image Diaries, Doodle, Animation, VideoScribe, Global, Vocations, Online.

Categories: Introduction, General Marketplace Literacy, Consumer Literacy, Entrepreneurial Literacy, Sustainability Literacy.

Do not add public Course, Module, Lesson, Topic, or Program navigation levels. The backend may keep `program = Marketplace Literacy` as metadata only.

## Windows Local Setup

1. Install Node.js LTS.
2. Open PowerShell in this project folder.
3. Run:

```powershell
npm install
npm run db:push
npm run db:seed
npm run dev
```

4. Open `http://localhost:3000`.

If port 3000 is busy:

```powershell
npm run dev -- -p 3005
```

## One-Click Windows Launch

Double-click `start.bat`.

It installs dependencies if needed, prepares the local SQLite database, starts the app, and opens the browser automatically.

To reset the local sample data, double-click `reset-sample-data.bat`.

## Admin Login

Local development account:

- Email: `admin@marketplaceliteracy.org`
- Password: `ChangeMe123!`

Change this password before public deployment. Log in, open `Settings`, and use the password change form.

## Add a Resource

1. Log in to admin.
2. Open `Manage Resources`.
3. Click `Add New Resource`.
4. Add a title and optional YouTube URL.
5. Choose Language, Resource Format, and Category.
6. Choose Resource Type and visibility.
7. Add facilitator notes, transcript/script, tags, duration, and order.
8. Publish or save as draft.

If no thumbnail is provided, the app uses the local thumbnail for the selected language.

## Import a YouTube Playlist

The playlist importer stores links and metadata only. It calls the YouTube Data API from the server and preserves playlist order.

Admin must choose:

- Language
- Resource Format
- Category
- Resource Type
- Optional Resource Collection
- Visibility

The importer saves:

- YouTube watch URL
- YouTube embed URL
- YouTube video ID
- source playlist ID and URL
- selected local fallback thumbnail
- order index
- publication status

Duplicates are checked by YouTube video ID, language, resource format, and category. Existing matching resources are updated instead of creating duplicate entries.

## Build for Local Production Test

```powershell
npm run build
npm start
```

## Build the Windows App Folder

```powershell
npm run dist:win
```

The runnable app is created at:

```text
dist\win-unpacked\MLP Video Library.exe
```

## Netlify Deployment Instructions

Do not switch `marketplaceliteracyglobal.org` until the temporary Netlify URL is tested and approved.

### Recommended Production Database

Use Neon Postgres or Supabase Postgres for production. The local Windows app uses SQLite through `prisma/schema.prisma`; Netlify uses Postgres through `prisma/schema.postgres.prisma`.

Netlify build command:

```text
npm run build:netlify
```

Publish directory:

```text
.next
```

`next.config.ts` keeps standalone output for Windows packaging, but disables standalone output when `NETLIFY=true` so Netlify can use its normal Next.js runtime.

Required Netlify environment variables:

```text
DATABASE_URL=
DIRECT_URL=
SESSION_SECRET=
YOUTUBE_API_KEY=
COOKIE_SECURE=true
NETLIFY_NEXT_SKEW_PROTECTION=true
NODE_VERSION=20
NEXT_PUBLIC_SITE_URL=https://your-temporary-site.netlify.app
```

Keep `DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, and `YOUTUBE_API_KEY` server-side only. Do not prefix them with `NEXT_PUBLIC_`.

For Supabase, use the pooled connection string for `DATABASE_URL` and the direct connection string for `DIRECT_URL`. Prisma uses `DIRECT_URL` when creating or updating tables during deployment.

Before first Netlify deploy, create the production database and run this locally against the production `DATABASE_URL`:

```powershell
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
npm run db:push:postgres
npm run db:seed:postgres
```

This creates required tables and seed data. Do not run destructive reset commands against production.

### Admin Security Notes

- Change the default admin password before public launch.
- Use a long random `SESSION_SECRET`.
- Set `COOKIE_SECURE=true` on Netlify.
- Keep `COOKIE_SECURE=false` only for local HTTP/Electron testing.
- Rotate the YouTube API key before public launch if it was shared during development.
- Admin routes include `noindex, nofollow` headers.

### GitHub to Netlify Workflow

1. Push this project to a private or trusted GitHub repository.
2. Create a Netlify site from that repository.
3. Confirm Netlify uses `netlify.toml`.
4. Add all required environment variables in Netlify.
5. Create and prepare the hosted Postgres database.
6. Deploy to a temporary `*.netlify.app` URL.
7. Test the full app before connecting the real domain.

### Temporary URL Testing

Test these on the temporary Netlify URL:

- Homepage
- `/resources`
- Language pages
- Resource Format pages
- Category pages
- Resource playback and YouTube embeds
- Search
- Admin login
- Admin navigation and browser refresh while logged in
- Resource create/edit/delete
- YouTube playlist import
- Thumbnails
- Mobile layout
- Empty states and 404 page
- HTTPS

### Domain Replacement Plan

Do not change DNS until the temporary Netlify URL is approved.

Preferred approach: keep DNS where it is and add the external domain to Netlify.

When ready:

1. Add `www.marketplaceliteracyglobal.org` in Netlify.
2. Add `marketplaceliteracyglobal.org` in Netlify.
3. Choose the primary domain.
4. Redirect the non-primary domain to the primary domain.
5. Use the exact DNS records Netlify shows.
6. For `www`, Netlify will likely ask for a CNAME to the Netlify site URL.
7. For the root domain, the DNS provider may use ALIAS, ANAME, flattened CNAME, or A records.
8. Wait for DNS propagation.
9. Confirm the HTTPS certificate.
10. Test public pages, admin login, and YouTube playback.

Do not guess DNS values. Use the exact values Netlify provides.

### Rollback Plan

- Keep the old app and hosting active for at least 2-4 weeks.
- Record old DNS values before changing anything.
- If the new app has a serious issue, restore the old DNS records.
- Export/back up the production database before major changes.
- Do not delete the old app until the new app is stable.

## Troubleshooting

- If admin login works but navigation returns to login locally, use `COOKIE_SECURE="false"` for HTTP.
- If admin login fails in production, confirm `SESSION_SECRET` and `COOKIE_SECURE=true` are set.
- If playlist import says an API key is required, set `YOUTUBE_API_KEY` in Netlify and redeploy.
- If Prisma cannot connect on Netlify, confirm `DATABASE_URL` points to Postgres, not `file:../dev.db`.
- If images do not show, confirm local thumbnail files exist in `public\thumbnails\languages`.
- If the database looks old locally, run `npm run db:seed`.

## Health Check

```text
/api/health
```

This returns a small JSON response showing whether the app can reach the database.

## iOS Preparation

The iOS planning documents live in `docs/ios/`. Start with `docs/ios/IOS_PREPARATION_PACKET.md`, then use the App Store listing draft, privacy answers draft, release checklist, and asset checklist when the Apple Developer account is approved.

## Android Release

The Google Play update is implemented in `android/`. Start with `docs/android/ANDROID_RELEASE_README.md`, then review the validation report, Data safety review, and Play release notes in the same folder before uploading the signed bundle.

## Educator Studio

Educator Studio (`/studio`) lets authorized educators create localized versions of Marketplace Literacy lessons: translate, narrate (record, AI voice, upload, or one full recording that is aligned automatically), review on a synchronized timeline, generate a 1080p/720p MP4 and publish it back into the library. The public "Admin Login" button is now "Educator Studio"; staff still sign in at `/admin/login`.

- Architecture audit and design: `docs/educator-studio/ARCHITECTURE_AUDIT.md`
- Deployment (storage bucket, provider keys, worker, roles, credits): `docs/educator-studio/DEPLOYMENT.md`
- Admin: `/admin/studio` (users & AI Voice credits, providers & glossary, jobs & usage ledger)
- Worker (FFmpeg rendering + alignment): `npm run worker`
- Tests: `npm run test:studio`
