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


# TODO
# - add a loading indicator (not sure if this is possible)

'''
### setup ###
files needed
- create-calendar-event-from-clipboard.py
- Google Calendar Client Secret.json
- requirements.txt

Make a new .env file
- go to aistudio.google.com to get and set the GEMINI_API_KEY in the .env file
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
import http.client
from dotenv import load_dotenv
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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
  print("Error: GEMINI_API_KEY not found in .env file")
  sys.exit(1)

# Path to store credentials
CONFIG_DIR = os.path.expanduser("./")
CREDENTIALS_PATH = os.path.join(CONFIG_DIR, "Google Calendar Client Secret.json")
TOKEN_PATH = os.path.join(CONFIG_DIR, "token.json")
# Use gemini-2.0-flash for both text and image inputs
GEMINI_MODEL = "gemini-2.0-flash"
# Google API scope
SCOPES = ['https://www.googleapis.com/auth/calendar.events']
# Default timezone
TIMEZONE = "America/Los_Angeles"


# ------------------ Helper Functions ------------------
def create_gemini_request_body(content):
  """Create the appropriate request body based on content type."""
  now = datetime.datetime.now()
  current_date = now.strftime("%Y-%m-%d")
  day_of_week = now.strftime("%A")

  prompt = f"""
Extract ONLY ONE event detail from the following text/image and return a JSON object with these fields:
- title: The event title
- start_time: The start time in ISO format (YYYY-MM-DDTHH:MM:SS)
- end_time: The end time in ISO format (YYYY-MM-DDTHH:MM:SS)
- location: The location (if any)
- description: Any additional details

Notes: 
- If multiple events are detected, only extract the first/most prominent one.
- Use empty string instead of null for any missing values.
- If there is no calendar event, return a JSON object with a single field: no_event: true
- Only return valid JSON, no explanatory text before or after.
- If no start/end time is explicitly stated in the text/image, make a best guess based on the type of event.
- Feel free to take liberties in the naming and details of the event to make it useful.
- Today's date: {current_date} ({day_of_week})
"""

  
  if content['type'] == 'text':
    return {
      "contents": [{
        "parts": [{
          "text": f"{prompt}\n\nText: {content['content']}"
        }]
      }]
    }
  else:  # image
    image_b64 = base64.b64encode(content['content']).decode('utf-8')
    return {
      "contents": [{
        "parts": [
          {"text": prompt},
          {
            "inline_data": {
              "mime_type": "image/png",
              "data": image_b64
            }
          }
        ]
      }]
    }

def query_gemini(content):
  """Query Gemini API with content from clipboard."""
  headers = {"Content-Type": "application/json"}
  request_body = create_gemini_request_body(content)
  
  # Make API request
  conn = http.client.HTTPSConnection("generativelanguage.googleapis.com")
  endpoint = f"/v1/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
  
  try:
    conn.request("POST", endpoint, json.dumps(request_body), headers)
    response = conn.getresponse()
    result = json.loads(response.read().decode("utf-8"))
    
    # Extract the text response from Gemini
    if "candidates" in result and len(result["candidates"]) > 0:
      response_text = result["candidates"][0]["content"]["parts"][0]["text"]
      
      # Find JSON in response if wrapped in backticks
      json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
      if json_match:
        response_text = json_match.group(1)
      
      # Replace any JSON null with empty strings before parsing
      response_text = response_text.replace(': null', ': ""')
      
      # Parse the JSON response
      event_data = json.loads(response_text)
      
      # Check if Gemini found no event
      if 'no_event' in event_data and event_data['no_event']:
        raise ValueError("No calendar event found in the clipboard content")
      
      print("\nExtracted event data:")
      print(json.dumps(event_data, indent=2))
      return event_data
    else:
      raise ValueError("Failed to get a proper response from Gemini API")
  except json.JSONDecodeError:
    raise ValueError("Failed to parse JSON from Gemini response")
  except Exception as e:
    raise ValueError(f"Error querying Gemini API: {e}")

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
    print("Reading clipboard content...")
    clipboard_content = get_clipboard_content()
    
    print(f"Analyzing {'image' if clipboard_content['type'] == 'image' else 'text'} with Gemini API...")
    event_data = query_gemini(clipboard_content)
    
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

