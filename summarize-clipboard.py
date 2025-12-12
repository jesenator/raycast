#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Summarize Clipboard
# @raycast.mode fullOutput

# Optional parameters:
# @raycast.icon 📋

# Documentation:
# @raycast.description Summarize clipboard content using Haiku 4.5
# @raycast.author Jesse Gilbert

import sys
from utils import get_clipboard_text, ask

def main():
  text = get_clipboard_text()
  if not text:
    print("❌ Clipboard is empty")
    sys.exit(1)
  
  prompt = f"""Summarize the following text concisely. Use bullet points for key points if appropriate.

<text>
{text}
</text>"""
  
  summary = ask(prompt)
  if not summary:
    print("❌ Failed to generate summary")
    sys.exit(1)
  
  print(summary)

if __name__ == "__main__":
  main()

