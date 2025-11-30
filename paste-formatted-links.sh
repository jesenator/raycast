#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Paste Formatted Link(s)
# @raycast.mode silent
# @raycast.packageName Text Utils

# Optional parameters:
# @raycast.icon 🔗
# @raycast.description Format and paste links: strips URL prefixes from plain URLs, or removes markdown link notation [text](url) keeping just the display text

# Documentation:
# @raycast.author jesenator
# @raycast.authorURL https://github.com/jesenator

source "$(dirname "$0")/utils.sh"

# Get clipboard content
text=$(get_clipboard_text)

if [ -z "$text" ]; then
  echo "Error: Clipboard is empty"
  exit 1
fi

# Check if the text contains markdown-style links [text](url)
if echo "$text" | grep -qE '\[.+\]\(.+\)'; then
  # Text contains markdown links - remove the markdown notation, keep display text
  # Replace [display text](url) with just display text
  cleaned_text=$(echo "$text" | sed -E 's/\[([^]]+)\]\([^)]+\)/\1/g')
else
  # Plain URL - strip prefixes like before
  cleaned_text="$text"

  # Remove https:// prefix
  cleaned_text=$(echo "$cleaned_text" | sed 's|^https://||')

  # Remove http:// prefix
  cleaned_text=$(echo "$cleaned_text" | sed 's|^http://||')

  # Remove www. prefix
  cleaned_text=$(echo "$cleaned_text" | sed 's|^www\.||')

  # Remove trailing slashes
  cleaned_text=$(echo "$cleaned_text" | sed 's|/*$||')
fi

# Copy cleaned text to clipboard
echo -n "$cleaned_text" | pbcopy

# Get the active app for pasting
active_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')

# Paste the cleaned text
osascript -e "tell application \"System Events\" to tell application process \"$active_app\" to keystroke \"v\" using command down"

echo "Cleaned and pasted: $cleaned_text"
