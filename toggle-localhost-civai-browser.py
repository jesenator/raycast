#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Localhost ↔ CivAI (Browser)
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔄

# Documentation:
# @raycast.description Toggle current browser tab between localhost and civai.org domains
# @raycast.author Jesse Gilbert

import subprocess
import sys

PAIRS = [
  ("localhost:8000", "research.civai.org"),
  ("localhost:8080", "civai.org"),
  ("localhost:12940", "civai.org"),
]

def get_current_url():
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

def navigate_current_tab(url, browser_name):
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

def toggle_url(url):
  for local, remote in PAIRS:
    if local in url:
      toggled = url.replace(f"http://{local}", f"https://{remote}")
      toggled = toggled.replace(f"https://{local}", f"https://{remote}")
      toggled = toggled.replace(local, remote)
      return toggled, f"{local} -> {remote}"
    if remote in url:
      toggled = url.replace(f"https://{remote}", f"http://{local}")
      toggled = toggled.replace(f"http://{remote}", f"http://{local}")
      toggled = toggled.replace(remote, local)
      return toggled, f"{remote} -> {local}"
  return None, None

def main():
  current_url, browser_name = get_current_url()
  if not current_url:
    print("Error: Could not get current URL from any browser")
    sys.exit(1)

  toggled_url, label = toggle_url(current_url)
  if not toggled_url:
    print(f"Error: URL does not match any aliases: {current_url}")
    sys.exit(1)

  if navigate_current_tab(toggled_url, browser_name):
    print(f"Toggled: {label}")
  else:
    print("Error: Could not navigate to toggled URL")
    sys.exit(1)

if __name__ == "__main__":
  main()
