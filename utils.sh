#!/bin/bash

# Shared utility functions for Raycast scripts

# Process image from clipboard - check for QR codes and perform OCR
process_clipboard_image() {
  local temp_image="./raycast_clipboard_image.png"
  local result_text=""
  
  if pngpaste "$temp_image" 2>/dev/null; then
    # First check for QR codes in the image
    local qr_result=$(zbarimg --quiet --raw "$temp_image" 2>/dev/null | head -1)
    
    if [ -n "$qr_result" ]; then
      # QR code found, use its content
      result_text="$qr_result"
    else
      # No QR code, perform OCR on the image
      local image_text=$(tesseract "$temp_image" stdout 2>/dev/null)
      if [ -n "$image_text" ]; then
        # Replace newlines with spaces and clean up extra spaces
        result_text=$(echo "$image_text" | tr '\n' ' ' | tr -s ' ')
      fi
    fi
    
    # Clean up temporary image file
    rm -f "$temp_image"
  fi
  
  echo "$result_text"
}

# Check if text is a URL pattern
is_url() {
  local text="$1"
  if [[ $text =~ ^(https?://|www\.) ]] || [[ $text =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)+(/.*)?$ ]]; then
    return 0  # true
  else
    return 1  # false
  fi
}

# Open content based on type (file, URL, or search)
open_content() {
  local text="$1"
  
  if [ -z "$text" ]; then
    echo "No text to process"
    return 1
  fi
  
  if [ ${#text} -gt 200 ]; then
    echo "Error: Content too long (${#text} characters). Maximum allowed is 200 characters."
    return 1
  fi
  
  # Check if the text is a local file or folder path
  if [[ -e "$text" ]]; then
    # If it's a file, reveal it in Finder; if it's a folder, open it
    if [[ -f "$text" ]]; then
      open -R "$text"
      echo "Opened file in Finder: $text"
    else
      open "$text"
      echo "Opened folder: $text"
    fi
  elif is_url "$text"; then
    # It's a URL
    # Add https:// if the URL doesn't start with http:// or https://
    if [[ ! $text =~ ^https?:// ]]; then
      text="https://$text"
    fi
    open "$text"
    echo "Opened URL: $text"
  else
    # Not a URL or local path, do a Google search
    local query=$(echo "$text" | perl -MURI::Escape -ne 'print uri_escape($_)')
    open "https://www.google.com/search?q=$query"
    echo "Searched Google for: $text"
  fi
}

# Copy selected text from the active application
copy_selected_text() {
  local active_app=$(osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true')
  
  osascript <<EOF
tell application "System Events"
  tell application process "$active_app"
    keystroke "c" using command down
  end tell
end tell
EOF
  
  # Small delay to ensure clipboard is updated
  sleep 0.05
}

# Get text from selection first, then clipboard, including image processing
get_text_with_selection() {
  local initial_clipboard=$(pbpaste)
  
  # Try to copy selected text
  copy_selected_text
  
  local text=$(pbpaste)
  
  # If nothing was selected (clipboard didn't change), use the initial clipboard content
  if [ "$text" = "$initial_clipboard" ]; then
    text=$initial_clipboard
  fi
  
  # If we have text, return it
  if [ -n "$text" ]; then
    echo "$text"
    return 0
  fi
  
  # Check if clipboard contains an image
  local image_text=$(process_clipboard_image)
  if [ -n "$image_text" ]; then
    echo "$image_text"
    return 0
  fi
  
  return 1
}

# Get text from clipboard, including image processing
get_clipboard_text() {
  local text=$(pbpaste)
  
  # If clipboard contains text, return it
  if [ -n "$text" ]; then
    echo "$text"
    return 0
  fi
  
  # Check if clipboard contains an image
  local image_text=$(process_clipboard_image)
  if [ -n "$image_text" ]; then
    echo "$image_text"
    return 0
  fi
  
  return 1
}

# Open content in incognito mode
open_content_incognito() {
  local text="$1"
  
  if [ -z "$text" ]; then
    echo "No text to process"
    return 1
  fi
  
  if [ ${#text} -gt 200 ]; then
    echo "Error: Content too long (${#text} characters). Maximum allowed is 200 characters."
    return 1
  fi
  
  local url=""
  
  if is_url "$text"; then
    # Add https:// if the URL doesn't start with http:// or https://
    if [[ ! $text =~ ^https?:// ]]; then
      url="https://$text"
    else
      url="$text"
    fi
  else
    # Not a URL, do a Google search
    local query=$(echo "$text" | perl -MURI::Escape -ne 'print uri_escape($_)')
    url="https://www.google.com/search?q=$query"
  fi
  
  # Copy URL to clipboard temporarily
  local original_clipboard=$(pbpaste)
  echo -n "$url" | pbcopy
  
  # Activate Arc and open new incognito tab with Cmd+Shift+N, then paste and enter
  osascript <<EOF
tell application "Arc" to activate
delay 0.2
tell application "System Events"
  keystroke "n" using {command down, shift down}
  keystroke "v" using command down
  delay 0.7
  keystroke return
end tell
EOF
  
  # Restore original clipboard
  echo -n "$original_clipboard" | pbcopy
  
  echo "Opened in incognito: $url"
}

