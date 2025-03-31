#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search in Browser (from clipboard or selection)
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔍

# Documentation:
# @raycast.description Open links directly or search selected text in Google. Uses clipboard if no text selected. Performs OCR on clipboard images.
# @raycast.author Jesse Gilbert
# @raycast.dependencies ["pngpaste", "tesseract"]

# Save initial clipboard content
initial_clipboard=$(pbpaste)

# Get the frontmost app
active_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')

# Copy selected text
osascript <<EOF
tell application "System Events"
  tell application process "$active_app"
    keystroke "c" using command down
  end tell
end tell
EOF

# Small delay to ensure clipboard is updated
sleep 0.05

# Get clipboard contents
text=$(pbpaste)

# If nothing was selected (clipboard didn't change), use the initial clipboard content
if [ "$text" = "$initial_clipboard" ]; then
  text=$initial_clipboard
fi

# Check if clipboard contains an image
temp_image="./raycast_clipboard_image.png"

if pngpaste "$temp_image" 2>/dev/null; then
  # Perform OCR on the image and capture output directly
  image_text=$(tesseract "$temp_image" stdout 2>/dev/null)
  if [ -n "$image_text" ]; then
    text="$image_text"
  fi
  # Clean up temporary image file
  rm -f "$temp_image"
fi

if [ -z "$text" ]; then
  echo "No text selected, in clipboard, or recognized from image"
  exit 1
fi

# Check if the text is a URL
if [[ $text =~ ^(https?://|www\.) ]] || [[ $text =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+(/.*)?$ ]]; then
  # Add https:// if the URL doesn't start with http:// or https://
  if [[ ! $text =~ ^https?:// ]]; then
    text="https://$text"
  fi
  open "$text"
else
  # Not a URL, do a Google search
  query=$(echo "$text" | perl -MURI::Escape -ne 'print uri_escape($_)')
  open "https://www.google.com/search?q=$query"
fi 