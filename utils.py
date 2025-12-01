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
import re
import time
from openai import OpenAI

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
    date_payload = {"start": due_date}
    if "T" in due_date:
      start_dt = datetime.fromisoformat(due_date)
      end_dt = start_dt + timedelta(minutes=30)
      date_payload["end"] = end_dt.isoformat()
        
    properties["Due date"] = {"date": date_payload}
  
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
        date_part = due_date.split("T")[0] if 'T' in due_date else due_date
        due_date_obj = datetime.strptime(date_part, "%Y-%m-%d")

        days_from_now = (due_date_obj - datetime.now()).days + 1
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
  """Parse date string into ISO format date or datetime string."""
  if not date_str:
    return None

  try:
    s = date_str.strip().lower()
    now = datetime.now()

    # Handle dot notation: "." = nearest half hour, ".1" = +1 hour, ".2" = +2 hours, etc.
    if s.startswith('.'):
      minute = (now.minute + 15) // 30 * 30
      dt = now.replace(minute=minute % 60, second=0, microsecond=0)
      if minute >= 60:
        dt += timedelta(hours=1)
      if s[1:]:
        dt += timedelta(hours=int(s[1:]))
      return dt.astimezone().isoformat(timespec='milliseconds')

    # Handle special keyword dates
    if s == 'now' or s == 'n':
      minute = (now.minute + 14) // 15 * 15
      dt = now.replace(minute=minute if minute < 60 else 0, second=0, microsecond=0)
      if minute == 60:
        dt += timedelta(hours=1)
      return dt.astimezone().isoformat(timespec='milliseconds')
    elif s == 'today':
      return now.strftime('%Y-%m-%d')
    if s in {'tomorrow', 'tmr', 'tmrw'}:
      return (now + timedelta(days=1)).strftime('%Y-%m-%d')
    if s == 'later':
      return (now + timedelta(days=5)).strftime('%Y-%m-%d')

    # Handle numeric input as days from now
    if s.isdigit():
      return (now + timedelta(days=int(s))).strftime('%Y-%m-%d')

    # Handle time formats (12:30am, 5:00pm, etc.)
    m = re.match(r'^(\d{1,2}):?(\d{2})?\s*(am|pm|a|p)?$', s)
    if m:
      hour = int(m.group(1))
      minute = int(m.group(2) or 0)
      ampm = m.group(3)
      if ampm and ampm.startswith('p') and hour < 12:
        hour += 12
      if ampm and ampm.startswith('a') and hour == 12:
        hour = 0
      dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
      if dt < now:
        dt += timedelta(days=1)
      return dt.astimezone().isoformat(timespec='milliseconds')

    # Handle weekday names
    weekdays = {
      'monday': 0, 'mon': 0,
      'tuesday': 1, 'tue': 1, 'tues': 1,
      'wednesday': 2, 'wed': 2, 'weds': 2,
      'thursday': 3, 'thu': 3, 'thur': 3, 'thurs': 3,
      'friday': 4, 'fri': 4,
      'saturday': 5, 'sat': 5,
      'sunday': 6, 'sun': 6
    }
    if s in weekdays:
      days_ahead = (weekdays[s] - now.weekday()) % 7 or 7
      return (now + timedelta(days=days_ahead)).strftime('%Y-%m-%d')

    # Handle standard date formats
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%m/%d', '%m-%d'):
      try:
        dt = datetime.strptime(date_str, fmt)
        if fmt in ('%m/%d', '%m-%d'):
          dt = dt.replace(year=now.year)
          if dt < now:
            dt = dt.replace(year=now.year + 1)
        return dt.strftime('%Y-%m-%d')
      except ValueError:
        pass

    return None 
  except Exception as e:
    print(f"Error parsing date '{date_str}': {str(e)}")
    return None 

# ------------------- LLM Functions -------------------

def ask(prompt, model="anthropic/claude-haiku-4.5"):
  """Send a prompt to OpenRouter and get response."""
  api_key = os.getenv("OPENROUTER_API_KEY")
  if not api_key:
    print("Error: OPENROUTER_API_KEY not found in environment")
    return None
  
  try:
    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    response = client.chat.completions.create(
      model=model,
      messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content.strip()
  except Exception as e:
    print(f"Error calling OpenRouter API: {str(e)}")
    return None

def get_selected_text_or_all():
  """Get selected text from active app, or select all if nothing selected."""
  # Get the frontmost app
  active_app = subprocess.run([
    'osascript', '-e', 
    'tell application "System Events" to get name of first application process whose frontmost is true'
  ], capture_output=True, text=True).stdout.strip()
  print(f"active_app: {active_app}")
  
  # Save initial clipboard
  initial_clipboard = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout
  
  # Copy selected text
  subprocess.run([
    'osascript', '-e',
    f'tell application "System Events" to tell application process "{active_app}" to keystroke "c" using command down'
  ])
  
  # Small delay to ensure clipboard is updated
  time.sleep(0.05)
  
  # Get clipboard contents
  selected_text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout

  # If nothing was selected or clipboard hasn't changed, select all
  if not selected_text or selected_text == initial_clipboard:
    # Select all
    subprocess.run([
      'osascript', '-e',
      f'tell application "System Events" to tell application process "{active_app}" to keystroke "a" using command down'
    ])
    
    time.sleep(0.05)
    
    # Copy again
    subprocess.run([
      'osascript', '-e',
      f'tell application "System Events" to tell application process "{active_app}" to keystroke "c" using command down'
    ])
    
    time.sleep(0.05)
    selected_text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout
  
  return selected_text, initial_clipboard, active_app

def paste_text(active_app):
  """Paste text to the active application."""
  subprocess.run([
    'osascript', '-e',
    f'tell application "System Events" to tell application process "{active_app}" to keystroke "v" using command down'
  ]) 

# ------------------- Text-to-Speech Functions -------------------

def text_to_speech(text):
  """Convert text to speech using OpenAI TTS and play it."""
  # Get API key from environment
  api_key = os.getenv("OPENAI_API_KEY")
  if not api_key:
    print("Error: OPENAI_API_KEY not found in environment")
    return False
  
  if not text or not text.strip():
    print("Error: No text to convert to speech")
    return False
  
  try:
    # Initialize OpenAI client
    client = OpenAI(api_key=api_key)
    
    # Create a temporary file for the audio
    with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as temp_audio:
      audio_path = temp_audio.name
    
    # Generate speech using OpenAI TTS
    response = client.audio.speech.create(
      model="tts-1",
      voice="alloy",
      input=text[:4096]  # OpenAI TTS has a 4096 character limit
    )
    
    # Write audio to temporary file
    with open(audio_path, 'wb') as audio_file:
      for chunk in response.iter_bytes(1024):
        audio_file.write(chunk)
    
    # Play the audio using afplay (built into macOS)
    subprocess.run(['afplay', audio_path], check=True)
    
    # Clean up temporary file
    os.unlink(audio_path)
    
    return True
    
  except Exception as e:
    print(f"Error converting text to speech: {str(e)}")
    if os.path.exists(audio_path):
      os.unlink(audio_path)
    return False 