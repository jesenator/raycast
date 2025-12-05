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

pairs=(
  "localhost:8000;research.civai.org"
  "localhost:8080;civai.org"
  "localhost:12940;civai.org"
)

toggled=0

for pair in "${pairs[@]}"; do
  IFS=';' read -r local_alias remote_alias <<< "$pair"
  if [[ "$url" == *"$local_alias"* ]]; then
    toggled_url=$(echo "$url" | sed "s|http://$local_alias|https://$remote_alias|g" | sed "s|https://$local_alias|https://$remote_alias|g" | sed "s|$local_alias|$remote_alias|g")
    echo "$toggled_url" | pbcopy
    echo "Toggled: $local_alias → $remote_alias"
    toggled=1
    break
  fi
  if [[ "$url" == *"$remote_alias"* ]]; then
    toggled_url=$(echo "$url" | sed "s|https://$remote_alias|http://$local_alias|g" | sed "s|http://$remote_alias|http://$local_alias|g" | sed "s|$remote_alias|$local_alias|g")
    echo "$toggled_url" | pbcopy
    echo "Toggled: $remote_alias → $local_alias"
    toggled=1
    break
  fi
done

if [ "$toggled" -eq 0 ]; then
  echo "Error: URL does not match any aliases"
  echo "Current clipboard: $url"
  exit 1
fi
