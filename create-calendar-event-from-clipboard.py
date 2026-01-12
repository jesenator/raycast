#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Create calendar event from clipboard
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🗓️
# @raycast.packageName Calendar Tools

# Documentation:
# @raycast.description Create a calendar event in Google Calendar from your last copied item (either image or text)
# @raycast.author Jesse Gilbert


'''
### setup ###
files needed
- create-calendar-event-from-clipboard.py
- Google Calendar Client Secret.json
- requirements.txt

Make a new .env file
- go to openrouter.ai to get and set the OPENROUTER_API_KEY in the .env file
- optional: if you want the event link to open in Notion calendar instead of Google calendar, you'll have to do some annoying things that I'll need to explain to get and set the USER_EMAIL and UNIQUE_ID in the .env file

set up python environment and replace the python path at the top of this file

install requirements
- pip install -r requirements.txt
- brew install pngpaste

set up script in raycast
- add directory to custom scripts
- optional: set up a keyboard shortcut to run the script (I use ctrl+cmd+c)
'''

import os
import sys
import json
import base64
import subprocess
import datetime
import re
from dotenv import load_dotenv
from openai import OpenAI
from utils import get_clipboard_content

# Add Google API imports
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# ------------------ Configuration ------------------
# Load environment variables from .env file
load_dotenv()

# Get API key from environment
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
if not OPENROUTER_API_KEY:
  print("Error: OPENROUTER_API_KEY not found in .env file")
  sys.exit(1)

# Path to store credentials
CONFIG_DIR = os.path.expanduser("./")
CREDENTIALS_PATH = os.path.join(CONFIG_DIR, "Google Calendar Client Secret.json")
TOKEN_PATH = os.path.join(CONFIG_DIR, "token.json")
# Google API scope
SCOPES = ['https://www.googleapis.com/auth/calendar.events']
# Default timezone
TIMEZONE = "America/Los_Angeles"


# ------------------ Helper Functions ------------------
def query_llm(content):
  """Query OpenRouter API with content from clipboard."""
  now = datetime.datetime.now()
  prompt = f"""Extract ONLY ONE event detail from the following text/image and return a JSON object with these fields:
- title: The event title
- start_time: The start time in ISO format (YYYY-MM-DDTHH:MM:SS)
- end_time: The end time in ISO format (YYYY-MM-DDTHH:MM:SS)
- location: The location (if any)
- description: Any additional details (keep it brief, add it only if neccessary)
Notes: 
- If multiple events are detected, only extract the first/most prominent one.
- Use empty string instead of null for any missing values.
- Only return valid JSON, no explanatory text before or after.
- If no start/end time is explicitly stated, make a best guess based on the type of event.
- If the content obviously doesn't represent a calendar event, return: {{"no_event": true}}
- Feel free to take liberties in naming and details to make it useful.
- Today's date: {now.strftime("%Y-%m-%d")} ({now.strftime("%A")})
- Your timezone: {TIMEZONE}. Return the time in this timezone.
"""

  client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)
  
  if content['type'] == 'text':
    messages = [{"role": "user", "content": f"{prompt}\n\nText: {content['content']}"}]
  else:
    image_b64 = base64.b64encode(content['content']).decode('utf-8')
    messages = [{"role": "user", "content": [
      {"type": "text", "text": prompt},
      {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_b64}"}}
    ]}]
  
  response = client.chat.completions.create(model="anthropic/claude-haiku-4.5", messages=messages, temperature=0)
  response_text = response.choices[0].message.content
  
  # Find JSON in response if wrapped in backticks
  json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
  if json_match:
    response_text = json_match.group(1)
  
  event_data = json.loads(response_text.replace(': null', ': ""'))
  
  if event_data.get('no_event'):
    raise ValueError("No calendar event found in the clipboard content")
  
  print("\nExtracted event data:")
  print(json.dumps(event_data, indent=2))
  return event_data

def get_google_credentials():
  """Get and refresh Google API credentials."""
  if not os.path.exists(CREDENTIALS_PATH):
    raise ValueError(f"Google Calendar credentials not found at {CREDENTIALS_PATH}. Visit https://developers.google.com/calendar/api/quickstart/python to set up.")
  
  creds = None
  if os.path.exists(TOKEN_PATH):
    with open(TOKEN_PATH) as token_file:
      creds = Credentials.from_authorized_user_info(json.load(token_file))
  
  # If no credentials or they're invalid, refresh or run the flow
  if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
      print("Refreshing expired Google credentials...")
      creds.refresh(Request())
    else:
      print("Authorizing Google Calendar access...")
      flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
      creds = flow.run_local_server(port=0)
    
    # Save the refreshed/new credentials
    with open(TOKEN_PATH, 'w') as token:
      token.write(creds.to_json())
  
  return creds

def create_calendar_event(event_data):
  """Create a Google Calendar event with the extracted data."""
  # Format the event data for Google Calendar
  now = datetime.datetime.now()
  
  # Get start_time or default to now
  start_time = event_data.get('start_time', now.isoformat())
  
  # Set end_time (start_time + 1 hour if not specified)
  end_time = event_data.get('end_time', '')
  if not end_time:
    try:
      start_dt = datetime.datetime.fromisoformat(start_time)
      end_time = (start_dt + datetime.timedelta(hours=1)).isoformat()
    except ValueError:
      # If we can't parse the start time, use current time + 1 hour
      end_time = (now + datetime.timedelta(hours=1)).isoformat()
  
  event = {
    'summary': event_data.get('title', 'Untitled Event'),
    'location': event_data.get('location', ''),
    'description': event_data.get('description', ''),
    'start': {
      'dateTime': start_time,
      'timeZone': TIMEZONE,
    },
    'end': {
      'dateTime': end_time,
      'timeZone': TIMEZONE,
    },
  }
  
  # Get credentials and create the event
  creds = get_google_credentials()
  service = build('calendar', 'v3', credentials=creds)
  
  # Create the event in the primary calendar
  created_event = service.events().insert(calendarId='primary', body=event).execute()
  return created_event.get('htmlLink'), created_event.get('id')

def get_notion_calendar_url(event_id: str) -> str:
  """Convert Google Calendar URL to Notion Calendar URL"""
  # Get user email from environment variable
  email = os.getenv('USER_EMAIL')
  unique_id = os.getenv('UNIQUE_ID')
  
  if not email or not unique_id:
    raise ValueError("USER_EMAIL or UNIQUE_ID not found in environment")
  
  # Combine components and encode as base64
  path_to_encode = f"{event_id}/{email}/{unique_id}"
  encoded_path = base64.b64encode(path_to_encode.encode('utf-8')).decode('utf-8')
  
  # Return the Notion Calendar URL
  return f"https://calendar.notion.so/event/{encoded_path}"

# ------------------ Main Function ------------------
def main():
  try:
    clipboard_content = get_clipboard_content()
    if not clipboard_content:
      raise ValueError("Clipboard is empty")
    
    event_data = query_llm(clipboard_content)
    
    # Print a simplified summary of the event
    print("\nEvent Summary:")
    print(f"Title: {event_data.get('title', 'Untitled Event')}")
    print(f"When: {event_data.get('start_time', 'Unknown time')}")
    if event_data.get('location'):
      print(f"Where: {event_data.get('location')}")
    
    print("\nCreating calendar event...")
    google_calendar_url, event_id = create_calendar_event(event_data)
    
    # Convert to Notion Calendar URL
    print(f"Event ID: {event_id}")
    try:
      notion_calendar_url = get_notion_calendar_url(event_id)
      print(f"Opening Notion calendar URL: {notion_calendar_url}")
      subprocess.run(['open', notion_calendar_url], check=False)
    except Exception as e:
      print(f"Warning: Could not create Notion URL, using Google Calendar URL instead. Error: {e}")
      print(f"Opening Google calendar URL: {google_calendar_url}")
      subprocess.run(['open', google_calendar_url], check=False)
    
    # Final output for Raycast
    print(f"Event created: {event_data.get('title')}")
    
  except ValueError as e:
    print(f"{str(e)}")
    sys.exit(1)
  except Exception as e:
    print(f"Unexpected error: {str(e)}")
    sys.exit(1)

if __name__ == "__main__":
  main()

