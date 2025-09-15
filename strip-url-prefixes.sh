#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Strip URL Prefixes
# @raycast.mode silent
# @raycast.packageName Text Utils

# Optional parameters:
# @raycast.icon 🔗
# @raycast.description Strip https:// and www. prefixes from URLs in clipboard and paste immediately

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

# Strip https:// and www. prefixes
cleaned_text="$text"

# Remove https:// prefix
cleaned_text=$(echo "$cleaned_text" | sed 's|^https://||')

# Remove http:// prefix
cleaned_text=$(echo "$cleaned_text" | sed 's|^http://||')

# Remove www. prefix
cleaned_text=$(echo "$cleaned_text" | sed 's|^www\.||')

# Remove trailing slashes
cleaned_text=$(echo "$cleaned_text" | sed 's|/*$||')

# Copy cleaned text to clipboard
echo -n "$cleaned_text" | pbcopy

# Get the active app for pasting
active_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')

# Paste the cleaned text
osascript -e "tell application \"System Events\" to tell application process \"$active_app\" to keystroke \"v\" using command down"

echo "Cleaned and pasted: $cleaned_text"
