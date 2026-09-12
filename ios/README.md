# Marketplace Literacy iOS Shell

This folder contains the App Store-ready iOS wrapper source for Marketplace Literacy App.

It is intentionally a small native SwiftUI app that loads the public production site:

```text
https://marketplaceliteracyapp.org/
```

## App Store identifiers

- App Store app: Marketplace Literacy App
- Apple ID: `6797343611`
- Bundle ID: `org.marketplaceliteracy.app`
- Version: `1.0.0`
- First build number: `1`

## Why this uses XcodeGen

The current development machine is Windows. Apple requires macOS/Xcode for iOS archive, signing, and upload. To keep the project reproducible without owning a Mac, this folder uses `project.yml` with XcodeGen. A macOS cloud runner can generate the `.xcodeproj` and archive the app.

## Local build on a Mac

```bash
brew install xcodegen
cd ios
./scripts/generate-app-icons.sh
xcodegen generate
open MarketplaceLiteracyApp.xcodeproj
```

In Xcode:

1. Select the `MarketplaceLiteracyApp` target.
2. Set the Apple Developer team.
3. Confirm bundle ID `org.marketplaceliteracy.app`.
4. Archive.
5. Upload to App Store Connect.

## Cloud build

Use the GitHub Actions workflow at `.github/workflows/ios-app-store.yml`, or mirror the same commands in Codemagic/Bitrise.

Signing/upload still requires Apple credentials stored as secure secrets. Do not commit certificates, private keys, API keys, provisioning profiles, or passwords.

