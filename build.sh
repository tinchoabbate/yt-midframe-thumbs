#!/usr/bin/env bash
# Builds dist/<name>-<version>-firefox.zip and -chrome.zip from src/.
# The Chrome manifest is src/manifest.json minus Firefox-only keys;
# dist/chrome/ is left unzipped for chrome://extensions → "Load unpacked".
set -euo pipefail
cd "$(dirname "$0")"

version=$(python3 -c 'import json; print(json.load(open("src/manifest.json"))["version"])')
name="youtube-midpoint-thumbnails-$version"

rm -rf dist
mkdir -p dist/chrome
(cd src && zip -qr "../dist/$name-firefox.zip" . -x '.*')

cp -r src/. dist/chrome/
python3 - <<'EOF'
import json
p = "dist/chrome/manifest.json"
m = json.load(open(p))
del m["browser_specific_settings"]
m["minimum_chrome_version"] = "111"  # content script "world": "MAIN"
json.dump(m, open(p, "w"), indent=2)
EOF
(cd dist/chrome && zip -qr "../$name-chrome.zip" . -x '.*')

ls -1 dist/*.zip
