# Guideline 4.2 resubmission packet

Status: the native build has been compiled and launched on iPhone and iPad simulators, and the production catalog endpoint has returned 607 published lessons. Physical-device playback, persistence, and offline behavior remain release checks.

## App Review reply

Thank you for reviewing Marketplace Literacy App. We rebuilt the public iOS experience as a native learning library. Users can browse and search published lessons by language and resource format, open native lesson detail screens, save lessons, mark lessons complete, and keep private notes on their device. Lesson details and personal notes remain readable after a successful sync when the device is offline. Video playback still requires a network connection. The app no longer presents the website as its main interface; YouTube embeds are used only inside individual lesson screens for video playback.

To inspect the changes: open Discover, select a language and format, search for a lesson, and open it. Tap Save lesson and Mark complete, then visit Saved and Progress. Enter a note on the lesson screen. After a successful catalog load, switch the device offline to inspect saved lesson details and notes. Reconnect before testing video playback.

## App Store What's New

Explore the Marketplace Literacy library in a native iPhone and iPad experience. Search lessons by language and format, save favorites, track completed lessons, and keep private notes. Previously loaded lesson details can be read offline.

## Release checks

1. Verify `/api/mobile/catalog` continues to return only published lessons in active languages over HTTPS.
2. Build and install the signed iOS binary on a physical iPhone, including the review device size.
3. Verify initial load, search, filters, YouTube and direct video playback, saved lessons, completion, notes, relaunch persistence, and offline catalog reading.
4. Capture new App Store screenshots from the native build and update the listing to describe the new features accurately.
5. Confirm App Privacy answers reflect on-device notes and cached catalog, and that any reviewer account details still match the submitted build.
6. Submit the new build with the App Review reply above only after these checks pass.
