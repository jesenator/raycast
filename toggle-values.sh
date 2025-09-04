#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Values
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ⚡

# Documentation:
# @raycast.description Toggle between opposite values like true/false, 0/1, on/off
# @raycast.author Jesse Gilbert

# Get the directory of the current script to source utils.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared utility functions
source "$SCRIPT_DIR/utils.sh"

selected_text=$(get_text_with_selection)

if [ -z "$selected_text" ]; then
  echo "Error: No text selected"
  exit 1
fi

# Strip whitespace
word=$(echo "$selected_text" | xargs)

# Toggle the value
case "$word" in
  "true")
    toggled="false"
    ;;
  "false")
    toggled="true"
    ;;
  "True")
    toggled="False"
    ;;
  "False")
    toggled="True"
    ;;
  "0")
    toggled="1"
    ;;
  "1")
    toggled="0"
    ;;
  "on")
    toggled="off"
    ;;
  "off")
    toggled="on"
    ;;
  "On")
    toggled="Off"
    ;;
  "Off")
    toggled="On"
    ;;
  "ON")
    toggled="OFF"
    ;;
  "OFF")
    toggled="ON"
    ;;
  *)
    echo "'$word' is not a toggleable value"
    exit 1
    ;;
esac

# Type the toggled value directly
osascript -e "tell application \"System Events\" to keystroke \"$toggled\""

echo "Toggled: $word → $toggled"
