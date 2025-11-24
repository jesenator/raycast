#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Open in Split View
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📐
# @raycast.description Opens the current Arc tab URL 3 more times in split view

# Get current Arc tab URL
current_url=$(osascript -e 'tell application "Arc" to get URL of active tab of front window')

if [ -z "$current_url" ]; then
  echo "❌ Could not get current tab URL"
  exit 1
fi

# Save original clipboard
original_clipboard=$(pbpaste)

# Copy URL to clipboard
echo -n "$current_url" | pbcopy

# Open URL 3 times in split view
for i in {1..3}; do
  osascript <<EOF
tell application "Arc" to activate
tell application "System Events"
  keystroke "t" using command down
  delay 0.2
  keystroke "v" using command down
  delay 0.3
  keystroke return using option down
  delay 0.4
end tell
EOF
done

# Restore original clipboard
echo -n "$original_clipboard" | pbcopy

echo "✅ Opened in split view 3 times"

