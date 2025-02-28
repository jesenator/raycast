#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Create calendar event from clipboard
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🗓️
# @raycast.packageName Calendar Tools

# Documentation:
# @raycast.description Create a calendar event in Google Calendar from your last copied item (either image or text)
# @raycast.author Jesse Gilbert

import os
import sys
import json
import base64
import subprocess
import datetime
import re
import tempfile
from pathlib import Path
import http.client
import urllib.parse
import urllib.request
from dotenv import load_dotenv

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
def get_clipboard_content():
  """Get content from clipboard, detect if it's text or image."""
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
      raise ValueError("Clipboard is empty")
    return {'type': 'text', 'content': text}
  except Exception as e:
    if os.path.exists(img_path):
      os.unlink(img_path)
    raise ValueError(f"Error getting clipboard content: {e}")

def query_gemini(content):
  """Query Gemini API with content from clipboard."""
  # Common prompt instructions for both text and image
  prompt_instructions = """
  Extract event details and return a JSON object with these fields:
  - title: The event title
  - start_time: The start time in ISO format (YYYY-MM-DDTHH:MM:SS)
  - end_time: The end time in ISO format (YYYY-MM-DDTHH:MM:SS)
  - location: The location (if any)
  - description: Any additional details
  
  Use empty string instead of null for any missing values.
  If no year is specified in the event details, assume the current year is 2025.
  If there is no calendar event, return a JSON object with a single field: no_event: true
  Only return valid JSON, no explanatory text before or after.
  """
  
  headers = {"Content-Type": "application/json"}
  
  # Construct the request body based on content type
  if content['type'] == 'text':
    request_body = {
      "contents": [{
        "parts": [{
          "text": f"{prompt_instructions}\n\nText: {content['content']}"
        }]
      }]
    }
  else:  # image
    image_b64 = base64.b64encode(content['content']).decode('utf-8')
    request_body = {
      "contents": [{
        "parts": [
          {"text": prompt_instructions},
          {
            "inline_data": {
              "mime_type": "image/png",
              "data": image_b64
            }
          }
        ]
      }]
    }
  
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
    creds = Credentials.from_authorized_user_info(json.load(open(TOKEN_PATH)))
  
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
  event = {
    'summary': event_data.get('title', 'Untitled Event'),
    'location': event_data.get('location', ''),
    'description': event_data.get('description', ''),
    'start': {
      'dateTime': event_data.get('start_time', datetime.datetime.now().isoformat()),
      'timeZone': TIMEZONE,
    },
    'end': {
      'dateTime': event_data.get('end_time', ''),
      'timeZone': TIMEZONE,
    },
  }
  
  # If end_time is missing, default to start_time + 1 hour
  if not event_data.get('end_time'):
    try:
      start_dt = datetime.datetime.fromisoformat(event_data.get('start_time'))
      end_dt = start_dt + datetime.timedelta(hours=1)
      event['end']['dateTime'] = end_dt.isoformat()
    except:
      # If we can't parse the start time, use current time + 1 hour
      now = datetime.datetime.now()
      event['start']['dateTime'] = now.isoformat()
      event['end']['dateTime'] = (now + datetime.timedelta(hours=1)).isoformat()
  
  # Get credentials and create the event
  try:
    creds = get_google_credentials()
    service = build('calendar', 'v3', credentials=creds)
    
    # Create the event in the primary calendar
    created_event = service.events().insert(calendarId='primary', body=event).execute()
    return created_event.get('htmlLink'), created_event.get('id')
  except Exception as e:
    raise ValueError(f"Error creating calendar event: {e}")

def get_notion_calendar_url(event_id):
  """Convert Google Calendar URL to Notion Calendar URL"""
  # Get user email from environment variable
  email = os.getenv('USER_EMAIL')
  unique_id = os.getenv('UNIQUE_ID')
  
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
    except Exception as e:
      print(f"Warning: Could not create Notion URL, using Google Calendar URL instead. Error: {e}")
      notion_calendar_url = google_calendar_url

    # print(f"Google calendar URL: {google_calendar_url}")
    print(f"Opening Notion calendar URL: {notion_calendar_url}")
    subprocess.run(['open', notion_calendar_url], check=False)
    
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

