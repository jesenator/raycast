#!/Users/jesenator/Documents/raycast/.venv/bin/python

import os
import sys
import json
import datetime
from datetime import datetime, timedelta
import requests
import subprocess
import tempfile
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
NOTION_API_TOKEN = os.getenv("NOTION_API_TOKEN")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")

# ------------------- Clipboard Functions -------------------

def get_clipboard_text(): # not used currently
  """Get text content from clipboard."""
  try:
    text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout.strip()
    if not text:
      print("Error: Clipboard is empty")
      return None
    return text
  except Exception as e:
    print(f"Error getting clipboard content: {str(e)}")
    return None

def copy_to_clipboard(text):
  """Copy text to clipboard."""
  try:
    subprocess.run(['pbcopy'], input=text.encode('utf-8'), check=True)
    return True
  except Exception as e:
    print(f"Error copying to clipboard: {str(e)}")
    return False

def get_clipboard_content():
  """Get content from clipboard, detect if it's text or image.
  
  Returns:
    dict: A dictionary with 'type' ('text' or 'image') and 'content' (text string or image bytes)
  """
  # First check if there's an image on the clipboard
  with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_file:
    img_path = temp_file.name
  
  try:
    # Try to get image from clipboard using pngpaste
    result = subprocess.run(['pngpaste', img_path], 
                           capture_output=True, check=False)
    
    if result.returncode == 0:
      # Image found on clipboard
      with open(img_path, 'rb') as img_file:
        img_data = img_file.read()
      os.unlink(img_path)
      return {'type': 'image', 'content': img_data}
    
    # Fall back to text
    os.unlink(img_path)
    text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout
    if not text.strip():
      print("Error: Clipboard is empty")
      return None
    return {'type': 'text', 'content': text}
  except Exception as e:
    if os.path.exists(img_path):
      os.unlink(img_path)
    print(f"Error getting clipboard content: {str(e)}")
    return None

# ------------------- Notion Functions -------------------

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
      if due_date:
        days_from_now = (datetime.strptime(due_date, "%Y-%m-%d") - datetime.now()).days + 1
        due_date_str = f'(T-{days_from_now} day{"" if days_from_now == 1 else "s"}) '
      else:
        due_date_str = ''
      
      # Get the created task ID and generate the URL
      task_id = response.json().get("id", "").replace("-", "")
      task_url = f"https://www.notion.so/jessegilbert/{task_id}"
      
      print(f"✅ {due_date_str}{task_name}")
      return True, task_url
    else:
      error_msg = response.json().get("message", "Unknown error")
      print(f"Error: {error_msg}")
      return False, None
  
  except Exception as e:
    print(f"Error: {str(e)}")
    return False, None

def parse_date(date_str):
  """Parse date string into ISO format date."""
  if not date_str:
    return None
  
  try:
    # Handle special cases first
    if date_str.lower() in ["today", "now"]:
      return datetime.now().strftime("%Y-%m-%d")
    elif date_str.lower() in ["tomorrow", "tmr", "tmrw"]:
      return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    elif date_str.lower() == "later":
      return (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
    
    # Handle if input is just a number (days from now)
    if date_str.isdigit():
      days = int(date_str)
      return (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")
    
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
      today = datetime.now()
      current_weekday = today.weekday()
      
      # Calculate days to add to get to the target weekday
      days_to_add = (target_weekday - current_weekday) % 7
      if days_to_add == 0:  # If today is the target day, schedule for next week
        days_to_add = 7
        
      target_date = today + timedelta(days=days_to_add)
      return target_date.strftime("%Y-%m-%d")
    
    # Try common date formats
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%m/%d", "%m-%d"]:
      try:
        # Handle short date formats that don't include year
        if fmt in ["%m/%d", "%m-%d"]:
          date_obj = datetime.strptime(date_str, fmt)
          # Add current year
          date_obj = date_obj.replace(year=datetime.now().year)
          # If the date is in the past, use next year
          if date_obj < datetime.now():
            date_obj = date_obj.replace(year=datetime.now().year + 1)
          return date_obj.strftime("%Y-%m-%d")
        return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
      except ValueError:
        continue
    
    # If all else fails, return None
    print(f"Warning: Could not parse date '{date_str}', skipping due date")
    return None
  
  except Exception as e:
    print(f"Error parsing date: {str(e)}")
    return None 