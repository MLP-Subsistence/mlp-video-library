# No-Mac iOS Build Path

The iOS source has been promoted into `ios/` and can be built by a macOS cloud runner. You do not need to own a Mac, but Apple still requires Apple signing credentials.

## What is ready

- Native SwiftUI `WKWebView` wrapper.
- Bundle ID: `org.marketplaceliteracy.app`.
- Version: `1.0.0`.
- Build number input starts at `1`.
- App icon generation script.
- XcodeGen project definition.
- GitHub Actions macOS workflow:
  - `.github/workflows/ios-app-store.yml`

## Required secure secrets

Set these in the cloud build provider. Do not commit them.

### Apple signing

- `APPLE_DEVELOPMENT_TEAM_ID`
- `APPLE_CERTIFICATE_P12_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_KEYCHAIN_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `APPLE_PROVISIONING_PROFILE_SPECIFIER`

### App Store Connect API upload

- `APP_STORE_CONNECT_API_KEY_ID`
- `APP_STORE_CONNECT_API_ISSUER_ID`
- `APP_STORE_CONNECT_API_PRIVATE_KEY`

## Recommended flow

1. Push this repository to GitHub.
2. Add the secure secrets above under GitHub repository settings.
3. Run the `iOS App Store Build` workflow manually.
4. First run with `upload_to_app_store=false` for a simulator build smoke check.
5. Then run with `upload_to_app_store=true`.
6. Wait for App Store Connect processing.
7. In App Store Connect, open iOS App Version `1.0`, select the processed build, then add the version for review.

## Current hard boundary

From Windows alone, I can create and verify the iOS source package, but I cannot produce a signed App Store `.ipa` or upload a build without Apple signing credentials on a macOS runner.
