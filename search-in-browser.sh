#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Search in Browser (from clipboard or selection)
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔍

# Documentation:
# @raycast.description Open links directly or search selected text in Google. Uses clipboard if no text selected.
# @raycast.author Jesse Gilbert

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

if [ -z "$text" ]; then
  echo "No text selected or in clipboard"
  exit 1
fi

# Check if the text is a URL (supports http, https, www.)
if [[ $text =~ ^(https?://|www\.) ]] || [[ $text =~ \.(com|org|edu|net|io|dev|ai|app|co|me|so|tech|xyz|gov|mil|int|eu|uk|ca|au|de|fr|jp|cn|ru|in|br)(/.*)?$ ]]; then
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