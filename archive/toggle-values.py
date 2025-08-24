#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Values (python)
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ⚡

# Documentation:
# @raycast.description Toggle between opposite values like true/false, 0/1, on/off under cursor
# @raycast.author Jesse Gilbert

import sys
import subprocess

# Define toggle mappings
TOGGLES = {
  'true': 'false',
  'false': 'true',
  'True': 'False', 
  'False': 'True',
  '0': '1',
  '1': '0',
  'on': 'off',
  'off': 'on',
  'On': 'Off',
  'Off': 'On',
  'ON': 'OFF',
  'OFF': 'ON'
}

def main():
  # Copy selected text
  subprocess.run([
    'osascript', '-e',
    'tell application "System Events" to keystroke "c" using command down'
  ])
  
  # Get selected text from clipboard
  selected_text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout
  
  if not selected_text:
    print("Error: No text selected")
    sys.exit(1)
  
  # Strip whitespace and check if it's a toggleable value
  word = selected_text.strip()
  
  if word not in TOGGLES:
    print(f"'{word}' is not a toggleable value")
    sys.exit(1)
  
  # Get the toggled value
  toggled_value = TOGGLES[word]
  
  # Type the toggled value directly
  subprocess.run([
    'osascript', '-e',
    f'tell application "System Events" to keystroke "{toggled_value}"'
  ])
  
  print(f"Toggled: {word} → {toggled_value}")

if __name__ == "__main__":
  main()

