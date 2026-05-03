#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Set Timer
# @raycast.mode silent
# @raycast.argument1 { "name": "duration", "placeholder": "e.g. 5m, 30s, 1h", "type": "text", "optional": true }

# Optional parameters:
# @raycast.icon ⏱️

# Documentation:
# @raycast.description Set a native Apple timer, or leave empty to stop ringing/running timers (requires "Set Timer" shortcut)
# @raycast.author Jesse Gilbert

duration="$1"

# No duration → stop any ringing/running timers
if [ -z "$duration" ]; then
  # The ring is played by the notification subsystem, not by a kill-able process.
  # The only reliable way to silence it is UI scripting (requires Accessibility
  # permission for whatever app runs this — Raycast, Terminal, etc).

  # The ringing timer surfaces in NotificationCenter as an AXGroup whose
  # accessibility actions include one with description "Stop". Performing
  # that action silences and dismisses the timer.
  result=$(osascript 2>/dev/null <<'EOF'
with timeout of 5 seconds
  tell application "System Events"
    repeat with pname in {"NotificationCenter", "Notification Center"}
      try
        if exists process (pname as string) then
          tell process (pname as string)
            try
              set elems to entire contents of window 1
              repeat with e in elems
                try
                  repeat with a in (actions of e)
                    try
                      if (description of a) is "Stop" then
                        perform a
                        return "stopped"
                      end if
                    end try
                  end repeat
                end try
              end repeat
            end try
          end tell
        end if
      end try
    end repeat
  end tell
end timeout
return "none"
EOF
)

  if [ "$result" = "stopped" ]; then
    echo "Timers stopped"
  else
    echo "No ringing/active timer found (or Accessibility permission missing for this app)"
  fi
  exit 0
fi

# Parse duration to seconds
# Supports: 5m, 5min, 5mins, 5 minutes, 30s, 30sec, 1h, 1hr, 1hour, 1h30m, 90 (assumes minutes)
parse_to_seconds() {
  local input="$1"
  local total_seconds=0
  
  # Lowercase and normalize
  input=$(echo "$input" | tr '[:upper:]' '[:lower:]')
  
  # Extract hours (h, hr, hrs, hour, hours)
  if [[ "$input" =~ ([0-9]*\.?[0-9]+)[[:space:]]*(hours?|hrs?|h) ]]; then
    total_seconds=$(awk "BEGIN {printf \"%d\", $total_seconds + ${BASH_REMATCH[1]} * 3600}")
    input="${input//${BASH_REMATCH[0]}/}"
  fi
  
  # Extract minutes (m, min, mins, minute, minutes)
  if [[ "$input" =~ ([0-9]*\.?[0-9]+)[[:space:]]*(minutes?|mins?|m) ]]; then
    total_seconds=$(awk "BEGIN {printf \"%d\", $total_seconds + ${BASH_REMATCH[1]} * 60}")
    input="${input//${BASH_REMATCH[0]}/}"
  fi
  
  # Extract seconds (s, sec, secs, second, seconds)
  if [[ "$input" =~ ([0-9]*\.?[0-9]+)[[:space:]]*(seconds?|secs?|s) ]]; then
    total_seconds=$(awk "BEGIN {printf \"%d\", $total_seconds + ${BASH_REMATCH[1]}}")
    input="${input//${BASH_REMATCH[0]}/}"
  fi
  
  # If just a number remains, assume minutes
  input=$(echo "$input" | tr -cd '0-9.')
  if [[ -n "$input" ]]; then
    total_seconds=$(awk "BEGIN {printf \"%d\", $total_seconds + $input * 60}")
  fi
  
  echo "$total_seconds"
}

# Format seconds for display
format_duration() {
  local secs=$1
  local h=$((secs / 3600))
  local m=$(((secs % 3600) / 60))
  local s=$((secs % 60))
  local result=""
  [ $h -gt 0 ] && result="${h}h"
  [ $m -gt 0 ] && result="${result}${m}m"
  [ $s -gt 0 ] && result="${result}${s}s"
  [ -z "$result" ] && result="0s"
  echo "$result"
}

seconds=$(parse_to_seconds "$duration")

if [ "$seconds" -eq 0 ]; then
  echo "Error: Could not parse duration '$duration'"
  exit 1
fi

display=$(format_duration "$seconds")

# Run the shortcut with seconds
if shortcuts run "Set Timer" -i "$seconds" 2>/dev/null; then
  echo "Timer set for $display"
else
  echo "Error: Failed to set timer. Make sure you have a 'Set Timer' shortcut."
  exit 1
fi
