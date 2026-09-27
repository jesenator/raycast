#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Count Clipboard Words
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔢

# Documentation:
# @raycast.description Count the number of words in the clipboard
# @raycast.author Jesse Gilbert

import os
import subprocess

# Raycast runs scripts with no locale set, which makes pbpaste emit MacRoman
# instead of UTF-8; force UTF-8 so non-ASCII text decodes correctly
os.environ["LC_CTYPE"] = "UTF-8"

def main():
  try:
    text = subprocess.run(['pbpaste'], capture_output=True, text=True,
                          errors='replace').stdout.strip()
    
    if not text:
      print("0")
      return
    
    word_count = len(text.split())
    print(word_count)
  
  except Exception as e:
    print(f"Error: {str(e)}")

if __name__ == "__main__":
  main()

