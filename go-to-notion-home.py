#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Go to Notion Home
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🤖

# Documentation:
# @raycast.author Jesse Gilbert

import sys
import subprocess

def is_notion_active():
  try:
    cmd = ["osascript", "-e", 'tell application "System Events" to get name of first process whose frontmost is true']
    result = subprocess.run(cmd, capture_output=True, text=True)
    active_app = result.stdout.strip()
    return active_app == "Notion"
  except Exception:
    return False

def send_shortcut_with_applescript():
  # key code 18 using {control down, shift down}
  #  used to have a delay 0.1 but it seems to work fine without it
  applescript = '''
  tell application "System Events"
    repeat 6 times
      key code 32 using {command down, shift down}
    end repeat
  end tell
  '''
  subprocess.run(["osascript", "-e", applescript])

# Only send keystroke if Notion is the active app
if is_notion_active():
  try:
    send_shortcut_with_applescript()
  except Exception as e:
    print(f"Error: {str(e)}")
    sys.exit(1)
else:
  sys.exit(0)

