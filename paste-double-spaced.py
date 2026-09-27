#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Paste Double Spaced
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📄

# Documentation:
# @raycast.description Paste clipboard text with an extra newline between each line
# @raycast.author Jesse Gilbert

import os
import subprocess

# Raycast runs scripts with no locale set, which makes pbpaste/pbcopy fall
# back to MacRoman instead of UTF-8; force UTF-8 so non-ASCII text survives
os.environ["LC_CTYPE"] = "UTF-8"

def main():
  text = subprocess.run(['pbpaste'], capture_output=True, text=True,
                        errors='replace').stdout
  
  if not text.strip():
    print("Error: Clipboard is empty")
    return
  
  # Add extra newline between each line
  double_spaced = '\n\n'.join(text.split('\n'))
  
  # Copy to clipboard
  subprocess.run(['pbcopy'], input=double_spaced.encode('utf-8'), check=True)
  
  # Get active app and paste
  active_app = subprocess.run([
    'osascript', '-e',
    'tell application "System Events" to get name of first application process whose frontmost is true'
  ], capture_output=True, text=True).stdout.strip()
  
  subprocess.run([
    'osascript', '-e',
    f'tell application "System Events" to tell application process "{active_app}" to keystroke "v" using command down'
  ])
  
  print("Pasted with double spacing")

if __name__ == "__main__":
  main()

