#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Add to Notion
# @raycast.mode silent
# @raycast.argument1 { "name": "task", "placeholder": "Task name", "type": "text", "optional": false }
# @raycast.argument2 { "name": "date", "placeholder": "Due date (optional)", "type": "text", "optional": true }

# Optional parameters:
# @raycast.packageName Notion Tools

# Documentation:
# @raycast.description Add a task to your Notion database
# @raycast.author Jesse Gilbert

import sys
from utils import parse_date, add_task_to_notion, copy_to_clipboard

def main():
  # Get command line arguments
  task = sys.argv[1]
  date = sys.argv[2] if len(sys.argv) > 2 else None
  
  # Parse date if provided
  parsed_date = parse_date(date) if date else None
  
  # Add task to Notion
  success, task_url = add_task_to_notion(task, parsed_date)
  
  if success and task_url:
    copy_to_clipboard(task_url)
  
  if not success:
    sys.exit(1)

if __name__ == "__main__":
  main() 