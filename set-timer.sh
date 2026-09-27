#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Set Timer
# @raycast.mode silent
# @raycast.argument1 { "name": "duration", "placeholder": "e.g. 5m, 30s, 1h, or 'stop'", "type": "text" }

# Optional parameters:
# @raycast.icon ⏱️

# Documentation:
# @raycast.description Set a native Apple timer, or type "stop" to silence ringing/running timers (requires "Set Timer" shortcut)
# @raycast.author Jesse Gilbert

duration="$1"

# "stop" (or empty) → stop running timers and silence any ringing timer.
#
# How this works (no UI scripting / Accessibility permission needed):
#   * RINGING: the alarm sound is played by the NotificationCenter process.
#     On macOS 26 the banner is no longer reachable through the accessibility
#     tree (System Events can't even see a window for it), so performing its
#     "Stop" action is impossible. Instead we detect the ring via the
#     audio-out power assertion coreaudiod holds on NotificationCenter's
#     behalf, then kill NotificationCenter — launchd relaunches it instantly
#     and the ring does not resume. (Side effect: clears visible banners.)
#   * RUNNING: timers are owned by the mobiletimerd daemon, whose XPC API is
#     gated behind a private entitlement (only Clock.app has it). But its
#     state lives in a plain CoreData sqlite store, so: force-kill the daemon
#     (it ignores SIGTERM, and must be dead so it can't flush stale state
#     back), mark every non-stopped timer row as stopped, then restart the
#     daemon so it reloads the edited store. Verified: edited timers never
#     fire. ZSTATE 1 = stopped; anything else is running/paused/firing.
stop_word=$(echo "$duration" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
if [ -z "$stop_word" ] || [ "$stop_word" = "stop" ] || [ "$stop_word" = "s" ] || [ "$stop_word" = "off" ]; then
  timer_db="$HOME/Library/Group Containers/group.com.apple.mobiletimerd/local.sqlite"

  # Ringing? coreaudiod holds an audio-out assertion "Created for" NC's pid.
  nc_pid=$(pgrep -x NotificationCenter | head -1)
  ringing=false
  if [ -n "$nc_pid" ]; then
    if pmset -g assertions 2>/dev/null | awk -v nc="$nc_pid" '
        /Created for PID:/ { pid = $4; gsub(/[^0-9]/, "", pid) }
        /Resources:.*audio-out/ && pid == nc { found = 1 }
        END { exit found ? 0 : 1 }'; then
      ringing=true
    fi
  fi

  running=$(sqlite3 "$timer_db" "SELECT COUNT(*) FROM ZMTCDTIMER WHERE ZSTATE != 1;" 2>/dev/null)
  running=${running:-0}

  if [ "$ringing" = true ]; then
    killall NotificationCenter 2>/dev/null
  fi

  if [ "$running" -gt 0 ]; then
    killall -9 mobiletimerd 2>/dev/null
    apple_epoch_now=$(( $(date +%s) - 978307200 ))
    sqlite3 "$timer_db" "PRAGMA busy_timeout=3000; UPDATE ZMTCDTIMER SET ZSTATE = 1, ZDISMISSEDDATE = $apple_epoch_now, ZLASTMODIFIEDDATE = $apple_epoch_now WHERE ZSTATE != 1;" >/dev/null
    # -k restarts the daemon even if something relaunched it mid-edit, so it
    # always ends up reading the store as we left it
    launchctl kickstart -k "gui/$(id -u)/com.apple.mobiletimerd" 2>/dev/null
  fi

  if [ "$ringing" = true ] && [ "$running" -gt 0 ]; then
    echo "Silenced ringing timer and stopped $running running timer(s)"
  elif [ "$ringing" = true ]; then
    echo "Silenced ringing timer"
  elif [ "$running" -gt 0 ]; then
    if [ "$running" -eq 1 ]; then
      echo "Stopped running timer"
    else
      echo "Stopped $running running timers"
    fi
  else
    # Nothing detected — but "stop" means the user sees or hears *something*,
    # and the most likely miss is a ring in the instant before the audio
    # assertion appears. Restarting NC is harmless, so do it just in case.
    killall NotificationCenter 2>/dev/null
    echo "No running or ringing timer found"
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
