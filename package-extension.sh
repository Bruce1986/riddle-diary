#!/bin/bash
set -euo pipefail
# package-extension.sh — Creates a clean ZIP for Chrome Web Store submission

EXTENSION_NAME="riddle-diary"
VERSION=$(node -p "require('./manifest.json').version")
if [ -z "$VERSION" ]; then
  echo "ERROR: could not read version from manifest.json" >&2
  exit 1
fi
OUTPUT="${EXTENSION_NAME}-v${VERSION}.zip"

# Remove old package if exists
rm -f "$OUTPUT"

# Create ZIP excluding dev, test, and documentation files
zip -r "$OUTPUT" . \
  -x ".git/*" \
  -x ".github/*" \
  -x ".gemini/*" \
  -x ".claude/*" \
  -x "node_modules/*" \
  -x "tests/*" \
  -x "package.json" \
  -x "package-lock.json" \
  -x "eslint.config.js" \
  -x "eslint.config.mjs" \
  -x "CHROMEWEBSTORE.md" \
  -x "README.md" \
  -x "PRIVACY.md" \
  -x "AGENTS.md" \
  -x "GEMINI.md" \
  -x "TODO-*.md" \
  -x "WORKLOG.md" \
  -x "project-handbook.md" \
  -x ".gitignore" \
  -x "package-extension.sh" \
  -x "*.zip" \
  -x "*/.DS_Store" \
  -x ".DS_Store" \
  -x "icons/*.svg"

echo "✅ Packaged: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
