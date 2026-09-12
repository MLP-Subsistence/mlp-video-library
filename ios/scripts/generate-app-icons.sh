#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$IOS_DIR/.." && pwd)"
SOURCE_ICON="$REPO_ROOT/docs/ios/assets/app-store-icon-1024.png"
ICON_DIR="$IOS_DIR/MarketplaceLiteracyApp/Assets.xcassets/AppIcon.appiconset"

if [[ ! -f "$SOURCE_ICON" ]]; then
  echo "Missing source icon: $SOURCE_ICON" >&2
  exit 1
fi

mkdir -p "$ICON_DIR"

make_icon() {
  local filename="$1"
  local pixels="$2"
  sips -z "$pixels" "$pixels" "$SOURCE_ICON" --out "$ICON_DIR/$filename" >/dev/null
}

make_icon "icon-20@2x.png" 40
make_icon "icon-20@3x.png" 60
make_icon "icon-29@2x.png" 58
make_icon "icon-29@3x.png" 87
make_icon "icon-40@2x.png" 80
make_icon "icon-40@3x.png" 120
make_icon "icon-60@2x.png" 120
make_icon "icon-60@3x.png" 180
make_icon "icon-20-ipad@1x.png" 20
make_icon "icon-20-ipad@2x.png" 40
make_icon "icon-29-ipad@1x.png" 29
make_icon "icon-29-ipad@2x.png" 58
make_icon "icon-40-ipad@1x.png" 40
make_icon "icon-40-ipad@2x.png" 80
make_icon "icon-76@1x.png" 76
make_icon "icon-76@2x.png" 152
make_icon "icon-83.5@2x.png" 167
make_icon "icon-1024.png" 1024

echo "Generated iOS app icons in $ICON_DIR"

