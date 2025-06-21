#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Read Clipboard Aloud
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔊
# @raycast.packageName Text to Speech

# Documentation:
# @raycast.description Read the last clipboard item aloud using OpenAI TTS
# @raycast.author Jesse Gilbert

import sys
from utils import get_clipboard_content, text_to_speech

def main():
  clipboard_data = get_clipboard_content()
  
  if not clipboard_data:
    print("❌ Clipboard is empty")
    return
  
  if clipboard_data['type'] == 'text':
    text = clipboard_data['content'].strip()
    if not text:
      print("❌ No text content to read")
      return
    
    print(f"🔊 Reading clipboard content...")
    
    # Truncate very long text for better TTS experience
    if len(text) > 1000:
      text = text[:1000] + "... (truncated)"
      print("ℹ️  Long text truncated to 1000 characters")
    
    success = text_to_speech(text)
    
    if success:
      print("✅ Finished reading clipboard content")
    else:
      print("❌ Failed to read clipboard content")
  
  elif clipboard_data['type'] == 'image':
    print("🖼️ Clipboard contains an image - cannot read aloud")
  
  else:
    print("❓ Unknown clipboard content type")

if __name__ == "__main__":
  main() 