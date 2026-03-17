#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Duplicate Tab
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📑
# @raycast.description Duplicate the current Arc tab and switch to it

current_url=$(osascript -e 'tell application "Arc" to get URL of active tab of front window')

if [ -z "$current_url" ]; then
  echo "❌ Could not get current tab URL"
  exit 1
fi

osascript <<EOF
tell application "Arc"
  tell front window
    make new tab with properties {URL:"$current_url"}
  end tell
end tell
EOF

echo "✅ Duplicated tab"
