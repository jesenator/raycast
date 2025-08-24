#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search from Clipboard
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📋

# Documentation:
# @raycast.description Open links directly or search clipboard text in Google. Works with text, images (OCR), and QR codes from clipboard only.
# @raycast.author Jesse Gilbert
# @raycast.dependencies ["pngpaste", "tesseract", "zbar"]

# Get the directory of the current script to source utils.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utility functions
source "$SCRIPT_DIR/utils.sh"

# Get text from clipboard (including image processing)
text=$(get_clipboard_text)

# Check if we got any text
if [ -z "$text" ]; then
  echo "No text in clipboard or recognized from image"
  exit 1
fi

# Open the content
open_content "$text"

