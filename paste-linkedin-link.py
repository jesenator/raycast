#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Paste Random LinkedIn Link
# @raycast.mode silent

# Optional parameters:
# @raycast.packageName LinkedIn Tools

# Documentation:
# @raycast.description Paste the next LinkedIn link from list and remove it
# @raycast.author Jesse Gilbert

import os
import sys
import subprocess

LINKS_FILE = os.path.join(os.path.dirname(__file__), 'linkedin_links.txt')
# See this ChatGPT chat for more: https://chatgpt.com/c/68f695e7-6b6c-8333-8b46-ebfdb5a911f2

def main():
  if not os.path.exists(LINKS_FILE):
    print(f"Error: {LINKS_FILE} not found")
    sys.exit(1)
  
  with open(LINKS_FILE, 'r') as f:
    lines = [line.strip() for line in f if line.strip()]
  
  if not lines:
    print("No LinkedIn links remaining")
    sys.exit(1)
  
  # Get the first link
  link = lines[0]
  remaining = lines[1:]
  
  # Write remaining links back
  with open(LINKS_FILE, 'w') as f:
    for l in remaining:
      f.write(l + '\n')
  
  # Copy to clipboard
  subprocess.run(['pbcopy'], input=link.encode('utf-8'), check=True)
  
  # Paste it
  subprocess.run(['osascript', '-e', 
    'tell application "System Events" to keystroke "v" using command down'])
  
  print(f"Pasted: {link} ({len(remaining)} remaining)")

if __name__ == "__main__":
  main()

