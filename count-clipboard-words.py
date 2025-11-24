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

import subprocess

def main():
  try:
    text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout.strip()
    
    if not text:
      print("0")
      return
    
    word_count = len(text.split())
    print(word_count)
  
  except Exception as e:
    print(f"Error: {str(e)}")

if __name__ == "__main__":
  main()

