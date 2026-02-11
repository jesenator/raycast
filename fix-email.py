#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fix Email
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ✉️

# Documentation:
# @raycast.description Polish highlighted email text using Claude Opus 4.6
# @raycast.author Jesse Gilbert

import sys
import subprocess
import time
from utils import ask, copy_to_clipboard, paste_text

def main():
  active_app = subprocess.run([
    'osascript', '-e',
    'tell application "System Events" to get name of first application process whose frontmost is true'
  ], capture_output=True, text=True).stdout.strip()

  initial_clipboard = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout

  subprocess.run([
    'osascript', '-e',
    f'tell application "System Events" to tell application process "{active_app}" to keystroke "c" using command down'
  ])
  time.sleep(0.05)

  selected_text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout

  if not selected_text or selected_text == initial_clipboard:
    print("Error: No text selected")
    sys.exit(1)

  prompt = f"""Fix up the wording in this email to make it read well and sound professional, but keep my voice and don't change it too much. Fix any spelling/grammar issues. Don't add unnecessary fluff or formality. Don't use em dashes or semicolons unless already present.

Return only the corrected text, no explanation or formatting.

<email>
{selected_text}
</email>
"""

  result = ask(prompt, model="anthropic/claude-opus-4.6")

  if not result:
    copy_to_clipboard(initial_clipboard)
    print("Error: API call failed")
    sys.exit(1)

  if not copy_to_clipboard(result):
    copy_to_clipboard(initial_clipboard)
    print("Error: Failed to copy result")
    sys.exit(1)

  paste_text(active_app)

  if selected_text.strip() != result.strip():
    preview = result[:47] + "..." if len(result) > 50 else result
    print(f"Polished: {preview}")
  else:
    print("No changes needed")

if __name__ == "__main__":
  main()
