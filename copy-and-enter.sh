#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Copy and Enter
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ⌨️
# @raycast.description Simulate Cmd+A, Cmd+C, then Enter keypresses to save content to clipboard before submitting

# Configuration
delay_time=0.01

# Get the frontmost application
active_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')

# Simulate the keypresses
osascript <<EOF
tell application "System Events"
  tell application process "$active_app"
    keystroke "a" using command down
    delay $delay_time
    keystroke "c" using command down
    delay $delay_time
    key code 124
    delay $delay_time
    key code 36
  end tell
end tell
EOF

copied_content=$(pbpaste)

# Limit output length for display
if [ ${#copied_content} -gt 100 ]; then
  display_content="${copied_content:0:97}..."
else
  display_content="$copied_content"
fi

echo "✅ Copied: $display_content"
