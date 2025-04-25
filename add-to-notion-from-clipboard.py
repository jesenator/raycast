#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Add to Notion from Clipboard
# @raycast.mode silent

# Optional parameters:
# @raycast.packageName Notion Tools

# Documentation:
# @raycast.description Add clipboard text as a task to your Notion database
# @raycast.author Jesse Gilbert

import os
import sys
import json
import requests
import subprocess
from dotenv import load_dotenv

load_dotenv()
NOTION_API_TOKEN = os.getenv("NOTION_API_TOKEN")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

def get_clipboard_text():
  """Get text content from clipboard."""
  try:
    text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout.strip()
    if not text:
      print("Error: Clipboard is empty")
      sys.exit(1)
    return text
  except Exception as e:
    print(f"Error getting clipboard content: {str(e)}")
    sys.exit(1)

def add_task_to_notion(task_name):
  """Add a task to the Notion database."""
  url = "https://api.notion.com/v1/pages"
  
  headers = {
    "Authorization": f"Bearer {NOTION_API_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
  }
  
  # Create the task properties
  properties = {
    "Task": {
      "title": [
        {
          "text": {
            "content": task_name
          }
        }
      ]
    }
  }
  
  # Create the request body
  data = {
    "parent": {
      "database_id": NOTION_DATABASE_ID
    },
    "properties": properties
  }
  
  try:
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 200:
      print(f"✅ Added task from clipboard: {task_name}")
      return True
    else:
      error_msg = response.json().get("message", "Unknown error")
      print(f"Error: {error_msg}")
      return False
  
  except Exception as e:
    print(f"Error: {str(e)}")
    return False

def main():
  # Get text from clipboard
  task = get_clipboard_text()
  
  # Add task to Notion
  success = add_task_to_notion(task)
  
  if not success:
    sys.exit(1)

if __name__ == "__main__":
  main() 