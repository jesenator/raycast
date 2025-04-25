#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Add to Notion
# @raycast.mode compact
# @raycast.argument1 { "name": "task", "placeholder": "Task name", "type": "text", "optional": false }
# @raycast.argument2 { "name": "date", "placeholder": "Due date (optional)", "type": "text", "optional": true }

# Optional parameters:
# @raycast.packageName Notion Tools

# Documentation:
# @raycast.description Add a task to your Notion database
# @raycast.author Jesse Gilbert

import os
import sys
import json
import datetime
import requests
from dotenv import load_dotenv

load_dotenv()
NOTION_API_TOKEN = os.getenv("NOTION_API_TOKEN")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

def parse_date(date_str):
  """Parse date string into ISO format date."""
  if not date_str:
    return None
  
  try:
    # Handle special cases first
    if date_str.lower() in ["today", "now"]:
      return datetime.datetime.now().strftime("%Y-%m-%d")
    elif date_str.lower() in ["tomorrow", "tmr", "tmrw"]:
      return (datetime.datetime.now() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    elif date_str.lower() == "later":
      return (datetime.datetime.now() + datetime.timedelta(days=5)).strftime("%Y-%m-%d")
    
    # Handle days of the week
    days_mapping = {
      "monday": 0, "mon": 0, 
      "tuesday": 1, "tue": 1, "tues": 1,
      "wednesday": 2, "wed": 2, "weds": 2,
      "thursday": 3, "thu": 3, "thur": 3, "thurs": 3,
      "friday": 4, "fri": 4,
      "saturday": 5, "sat": 5,
      "sunday": 6, "sun": 6
    }
    
    if date_str.lower() in days_mapping:
      target_weekday = days_mapping[date_str.lower()]
      today = datetime.datetime.now()
      current_weekday = today.weekday()
      
      # Calculate days to add to get to the target weekday
      days_to_add = (target_weekday - current_weekday) % 7
      if days_to_add == 0:  # If today is the target day, schedule for next week
        days_to_add = 7
        
      target_date = today + datetime.timedelta(days=days_to_add)
      return target_date.strftime("%Y-%m-%d")
    
    # Try common date formats
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%m/%d", "%m-%d"]:
      try:
        # Handle short date formats that don't include year
        if fmt in ["%m/%d", "%m-%d"]:
          date_obj = datetime.datetime.strptime(date_str, fmt)
          # Add current year
          date_obj = date_obj.replace(year=datetime.datetime.now().year)
          # If the date is in the past, use next year
          if date_obj < datetime.datetime.now():
            date_obj = date_obj.replace(year=datetime.datetime.now().year + 1)
          return date_obj.strftime("%Y-%m-%d")
        return datetime.datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
      except ValueError:
        continue
    
    # If all else fails, return None
    print(f"Warning: Could not parse date '{date_str}', skipping due date")
    return None
  
  except Exception as e:
    print(f"Error parsing date: {str(e)}")
    return None

def add_task_to_notion(task_name, due_date=None):
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
  
  # Add due date if provided
  if due_date:
    properties["Due date"] = {
      "date": {
        "start": due_date
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
      print(f"✅ Added task: {task_name}" + (f" (due {due_date})" if due_date else ""))
      return True
    else:
      error_msg = response.json().get("message", "Unknown error")
      print(f"Error: {error_msg}")
      return False
  
  except Exception as e:
    print(f"Error: {str(e)}")
    return False

def main():
  # Get command line arguments
  task = sys.argv[1]
  date = sys.argv[2] if len(sys.argv) > 2 else None
  
  # Parse date if provided
  parsed_date = parse_date(date) if date else None
  
  # Add task to Notion
  success = add_task_to_notion(task, parsed_date)
  
  if not success:
    sys.exit(1)

if __name__ == "__main__":
  main() 