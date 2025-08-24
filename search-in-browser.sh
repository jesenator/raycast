#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search in Browser (from clipboard or selection)
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔍

# Documentation:
# @raycast.description Open links directly or search selected text in Google. Uses clipboard if no text selected. Performs OCR on clipboard images. Detects QR codes and opens their links.
# @raycast.author Jesse Gilbert
# @raycast.dependencies ["pngpaste", "tesseract", "zbar"]

# Get the directory of the current script to source utils.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utility functions
source "$SCRIPT_DIR/utils.sh"

# TODO: If I press shift when doing this then DON'T copy text from the app, just use the most recent item from the clipboard

# Get text from selection first, then clipboard (including image processing)
text=$(get_text_with_selection)

# Check if we got any text
if [ -z "$text" ]; then
  echo "No text selected, in clipboard, or recognized from image"
  exit 1
fi

# Open the content
open_content "$text" 