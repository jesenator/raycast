#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Localhost ↔ CivAI
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔄

# Documentation:
# @raycast.description Toggle URL between localhost:8080 and civai.org domains
# @raycast.author Jesse Gilbert

# Get URL from clipboard
url=$(pbpaste)

if [ -z "$url" ]; then
  echo "Error: Clipboard is empty"
  exit 1
fi

# Strip whitespace
url=$(echo "$url" | xargs)

# Toggle the URL
if [[ "$url" == *"localhost:8080"* ]]; then
  # Replace localhost:8080 with civai.org (ensure https for civai.org)
  toggled_url=$(echo "$url" | sed 's|http://localhost:8080|https://civai.org|g' | sed 's|https://localhost:8080|https://civai.org|g' | sed 's|localhost:8080|civai.org|g')
  echo "$toggled_url" | pbcopy
  echo "Toggled: localhost:8080 → civai.org"
elif [[ "$url" == *"civai.org"* ]]; then
  # Replace civai.org with localhost:8080 (ensure http for localhost)
  toggled_url=$(echo "$url" | sed 's|https://civai.org|http://localhost:8080|g' | sed 's|http://civai.org|http://localhost:8080|g' | sed 's|civai.org|localhost:8080|g')
  echo "$toggled_url" | pbcopy
  echo "Toggled: civai.org → localhost:8080"
else
  echo "Error: URL does not contain localhost:8080 or civai.org"
  echo "Current clipboard: $url"
  exit 1
fi
