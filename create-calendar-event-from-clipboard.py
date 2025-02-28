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
# CONFIG_DIR = os.path.expanduser("~/.config/raycast-calendar-helper")
CONFIG_DIR = os.path.expanduser("./")
CREDENTIALS_PATH = os.path.join(CONFIG_DIR, "Google Calendar Client Secret.json")
TOKEN_PATH = os.path.join(CONFIG_DIR, "token.json")
# Use gemini-2.0-flash for both text and image inputs
GEMINI_MODEL = "gemini-2.0-flash"
# Google API scope
SCOPES = ['https://www.googleapis.com/auth/calendar.events']

# ------------------ Helper Functions ------------------
def get_clipboard_content():
  """Get content from clipboard, detect if it's text or image."""
  # First check if there's an image on the clipboard
  with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_file:
    img_path = temp_file.name
  
  try:
    # Try to get image from clipboard using pngpaste
    result = subprocess.run(['pngpaste', img_path], 
                           capture_output=True, text=True, check=False)
    
    if result.returncode == 0:
      # Image found on clipboard
      with open(img_path, 'rb') as img_file:
        img_data = img_file.read()
      os.unlink(img_path)
      return {'type': 'image', 'content': img_data}
    
    # Fall back to text
    os.unlink(img_path)
    text = subprocess.run(['pbpaste'], capture_output=True, text=True).stdout
    return {'type': 'text', 'content': text}
  except Exception as e:
    print(f"Error getting clipboard content: {e}")
    if os.path.exists(img_path):
      os.unlink(img_path)
    sys.exit(1)

def query_gemini(content):
  """Query Gemini API with content from clipboard."""
  headers = {
    "Content-Type": "application/json"
  }
  
  # Construct the request body based on content type
  if content['type'] == 'text':
    request_body = {
      "contents": [{
        "parts": [{
          "text": f"""Extract event details from the following text. Return a JSON object with these fields:
          - title: The event title
          - start_time: The start time in ISO format (YYYY-MM-DDTHH:MM:SS)
          - end_time: The end time in ISO format (YYYY-MM-DDTHH:MM:SS)
          - location: The location (if any)
          - description: Any additional details
          
          Use empty string instead of null for any missing values.
          
          If there is no calendar event in the text, return a JSON object with a single field:
          - no_event: true
          
          Text: {content['content']}
          
          Only return valid JSON, no explanatory text before or after."""
        }]
      }]
    }
  else:  # image
    # Encode image as base64
    image_b64 = base64.b64encode(content['content']).decode('utf-8')
    request_body = {
      "contents": [{
        "parts": [
          {
            "text": """Extract calendar event details from this image. Return a JSON object with these fields:
            - title: The event title
            - start_time: The start time in ISO format (YYYY-MM-DDTHH:MM:SS)
            - end_time: The end time in ISO format (YYYY-MM-DDTHH:MM:SS)
            - location: The location (if any)
            - description: Any additional details
            
            Use empty string instead of null for any missing values.
            
            If there is no calendar event in the image, return a JSON object with a single field:
            - no_event: true
            
            Only return valid JSON, no explanatory text before or after."""
          },
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
      
      try:
        # Replace any JSON null with empty strings before parsing
        response_text = response_text.replace(': null', ': ""')
        # Parse the JSON response
        event_data = json.loads(response_text)
        
        # Check if Gemini found no event
        if 'no_event' in event_data and event_data['no_event']:
          print("\n❌ No calendar event found in the clipboard content.")
          print("The content does not appear to contain event details.")
          sys.exit(0)
        
        print("\n🤖 Gemini extracted the following event data:")
        print(json.dumps(event_data, indent=2))
        print()
        return event_data
      except json.JSONDecodeError:
        print(f"Failed to parse JSON from Gemini response: {response_text}")
        sys.exit(1)
    else:
      print(f"Unexpected response format from Gemini API: {result}")
      sys.exit(1)
  except Exception as e:
    print(f"Error querying Gemini API: {e}")
    sys.exit(1)

def setup_google_calendar():
  """Set up Google Calendar API credentials if not already done."""
  if not os.path.exists(CONFIG_DIR):
    os.makedirs(CONFIG_DIR)
    
  if not os.path.exists(CREDENTIALS_PATH):
    print("Google Calendar API credentials not found.")
    print("Please visit https://developers.google.com/calendar/api/quickstart/python")
    print("and follow the instructions to create OAuth credentials.")
    print(f"Then save the credentials.json file to {CREDENTIALS_PATH}")
    sys.exit(1)
    
  # Check if we have a valid token
  if not os.path.exists(TOKEN_PATH):
    authorize_google_calendar()
  
  return True

def authorize_google_calendar():
  """Run OAuth flow to authorize Google Calendar access."""
  print("Authorizing Google Calendar access...")
  
  creds = None
  if os.path.exists(TOKEN_PATH):
    creds = Credentials.from_authorized_user_info(json.load(open(TOKEN_PATH)))
  
  if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
      creds.refresh(Request())
    else:
      flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_PATH, SCOPES)
      creds = flow.run_local_server(port=0)
    with open(TOKEN_PATH, 'w') as token:
      token.write(creds.to_json())
  
  print("Authorization successful!")
  return True

def create_calendar_event(event_data, calendar_id=None):
  """Create a Google Calendar event with the extracted data."""
  # Format the event data for Google Calendar
  event = {
    'summary': event_data.get('title', 'Untitled Event'),
    'location': event_data.get('location', ''),
    'description': event_data.get('description', ''),
    'start': {
      'dateTime': event_data.get('start_time', datetime.datetime.now().isoformat()),
      'timeZone': 'America/Los_Angeles',  # You might want to make this configurable
    },
    'end': {
      'dateTime': event_data.get('end_time', ''),
      'timeZone': 'America/Los_Angeles',  # You might want to make this configurable
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
  
  # Load credentials and create API client
  try:
    creds = Credentials.from_authorized_user_info(json.load(open(TOKEN_PATH)))
    service = build('calendar', 'v3', credentials=creds)
    
    # Use primary calendar if none specified
    cal_id = calendar_id if calendar_id else 'primary'
    
    # Create the event
    event = service.events().insert(calendarId=cal_id, body=event).execute()
    calendar_url = event.get('htmlLink')
    return f"Event created: {calendar_url}"
  except Exception as e:
    print(f"Error creating calendar event: {e}")
    sys.exit(1)

# ------------------ Main Function ------------------
def main():
  # Step 1: Get clipboard content
  print("Reading clipboard content...")
  clipboard_content = get_clipboard_content()
  
  # Step 2: Query Gemini API to extract event details
  print(f"Analyzing {'image' if clipboard_content['type'] == 'image' else 'text'} with Gemini API...")
  event_data = query_gemini(clipboard_content)
  
  # Step 3: Set up Google Calendar API if needed
  print("Setting up Google Calendar access...")
  setup_google_calendar()
  
  # Step 4: Create the calendar event
  print("Creating calendar event...")
  result = create_calendar_event(event_data)
  
  print(result)
  print("✅ Calendar event created successfully!")
  
  # Step 5: Open the Google Calendar page in browser
  calendar_url = None
  url_match = re.search(r'Event created: (https://[^\s]+)', result)
  if url_match:
    calendar_url = url_match.group(1)
    print("\n🌐 Opening event in browser...")
    subprocess.run(['open', calendar_url], check=False)
  else:
    print("\n⚠️ Could not extract calendar URL to open in browser.")

if __name__ == "__main__":
  main()

