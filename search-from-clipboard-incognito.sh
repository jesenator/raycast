#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search from Clipboard (Incognito)
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🕵️

# Documentation:
# @raycast.description Open links directly or search clipboard text in Google in incognito mode. Works with text, images (OCR), and QR codes from clipboard only.
# @raycast.author Jesse Gilbert
# @raycast.dependencies ["pngpaste", "tesseract", "zbar"]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "$SCRIPT_DIR/utils.sh"

text=$(get_clipboard_text)

if [ -z "$text" ]; then
  echo "No text in clipboard or recognized from image"
  exit 1
fi

open_content_incognito "$text"


