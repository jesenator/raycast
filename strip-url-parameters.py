#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Strip URL Parameters
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🧹

# Documentation:
# @raycast.description Strip query parameters from the current URL and navigate to the clean URL
# @raycast.author Jesse Gilbert

import subprocess
import sys
import re
from urllib.parse import urlparse, urlunparse

def get_current_url():
  """Get current URL from Arc browser or fallback to other browsers."""
  browsers = [
    ('Arc', 'tell application "Arc" to get URL of active tab of front window'),
    ('Safari', 'tell application "Safari" to get URL of current tab of front window'),
    ('Google Chrome', 'tell application "Google Chrome" to get URL of active tab of front window'),
    ('Firefox', 'tell application "Firefox" to get URL of active tab of front window')
  ]
  
  for browser_name, script in browsers:
    try:
      result = subprocess.run(['osascript', '-e', script], 
                             capture_output=True, text=True, timeout=5)
      if result.returncode == 0 and result.stdout.strip():
        return result.stdout.strip(), browser_name
    except:
      continue
  
  return None, None

def strip_url_parameters(url):
  """Strip query parameters from URL."""
  parsed = urlparse(url)
  # Keep everything except query parameters
  clean_parsed = parsed._replace(query='', fragment='')
  return urlunparse(clean_parsed)

def navigate_current_tab(url, browser_name):
  """Navigate current tab to the new URL."""
  scripts = {
    'Arc': f'tell application "Arc" to set URL of active tab of front window to "{url}"',
    'Safari': f'tell application "Safari" to set URL of current tab of front window to "{url}"', 
    'Google Chrome': f'tell application "Google Chrome" to set URL of active tab of front window to "{url}"',
    'Firefox': f'tell application "Firefox" to set URL of active tab of front window to "{url}"'
  }
  
  script = scripts.get(browser_name)
  if not script:
    return False
    
  try:
    result = subprocess.run(['osascript', '-e', script], 
                           capture_output=True, text=True, timeout=5)
    return result.returncode == 0
  except:
    return False

def main():
  current_url, browser_name = get_current_url()
  
  if not current_url:
    print("Error: Could not get current URL from any browser")
    sys.exit(1)
  
  # Check if URL has parameters
  if '?' not in current_url and '#' not in current_url:
    print("URL has no parameters to strip")
    sys.exit(0)
  
  clean_url = strip_url_parameters(current_url)
  
  if clean_url == current_url:
    print("URL is already clean")
    sys.exit(0)
  
  # Navigate current tab to the clean URL
  if navigate_current_tab(clean_url, browser_name):
    print(f"✅ Navigated to clean URL: {clean_url}")
  else:
    print("Error: Could not navigate to clean URL")
    sys.exit(1)

if __name__ == "__main__":
  main()
