#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fix Spelling
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📝

# Documentation:
# @raycast.description Fix spelling of a highlighted word
# @raycast.author Jesse Gilbert
# @raycast.dependencies ["aspell"]

# Get the frontmost app
active_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')

# Save initial clipboard content
initial_clipboard=$(pbpaste)

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

# Get clipboard contents (the selected word)
selected_word=$(pbpaste)

# If nothing was selected or multiple words were selected
if [ -z "$selected_word" ] || [[ "$selected_word" =~ [[:space:]] ]]; then
  echo "Please select a single word to check spelling"
  exit 1
fi

# Check if aspell is installed
if ! command -v aspell &> /dev/null; then
  echo "Please install aspell: brew install aspell"
  exit 1
fi

# Get spelling suggestions
suggestions=$(echo "$selected_word" | aspell -a | tail -n +2)

# Check if the word is spelled correctly
if [[ "$suggestions" == "*" ]]; then
  echo "Word is spelled correctly"
  exit 0
fi

# Get the first suggestion
if [[ "$suggestions" =~ \&[[:space:]].*:[[:space:]]([^,]*) ]]; then
  corrected_word="${BASH_REMATCH[1]}"
  
  # Copy the corrected word to clipboard
  echo -n "$corrected_word" | pbcopy
  
  # Paste the corrected word
  osascript <<EOF
tell application "System Events"
  tell application process "$active_app"
    keystroke "v" using command down
  end tell
end tell
EOF
  
  echo "Fixed: $selected_word → $corrected_word"
else
  echo "No spelling suggestions found"
  # Restore original clipboard
  echo -n "$initial_clipboard" | pbcopy
  exit 1
fi

# Restore original clipboard
sleep 0.1
echo -n "$initial_clipboard" | pbcopy

