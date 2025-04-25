#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Add to Notion from Clipboard
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📝
# @raycast.packageName Notion Tools

# Documentation:
# @raycast.description Add clipboard text as a task to your Notion database
# @raycast.author Jesse Gilbert

import sys
from utils import get_clipboard_content, add_task_to_notion

def main():
  clipboard_content = get_clipboard_content()
  if not clipboard_content:
    sys.exit(1)
  
  if clipboard_content['type'] == 'text':
    success = add_task_to_notion(clipboard_content['content'])
    if not success:
      sys.exit(1)
  else:
    print("Error: Clipboard contains an image. Text content required.")
    sys.exit(1)

if __name__ == "__main__":
  main() 