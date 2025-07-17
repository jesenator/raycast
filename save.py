#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Save to File
# @raycast.mode silent
# @raycast.argument1 { "name": "filename", "placeholder": "Filename (optional)", "type": "text", "optional": true }

# Optional parameters:
# @raycast.icon 💾
# @raycast.packageName File Tools

# Documentation:
# @raycast.description Save clipboard content to a file in Documents/buffer directory
# @raycast.author Jesse Gilbert

import sys
import os
from datetime import datetime
from utils import get_clipboard_content, copy_to_clipboard

def main():
  # Get filename from argument or generate timestamp
  filename = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].strip() else None
  
  # Get clipboard content
  clipboard_data = get_clipboard_content()
  if not clipboard_data:
    print("Error: No content in clipboard")
    sys.exit(1)
  
  # Generate filename if not provided
  if not filename:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    if clipboard_data['type'] == 'text':
      filename = f"clipboard_{timestamp}.txt"
    else:
      filename = f"clipboard_{timestamp}.png"
  else:
    # Auto-add extension if not present
    if clipboard_data['type'] == 'text' and not filename.endswith('.txt'):
      filename += '.txt'
    elif clipboard_data['type'] == 'image' and not any(filename.endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp']):
      filename += '.png'
  
  # Create buffer directory if it doesn't exist
  buffer_dir = os.path.expanduser("~/Documents/buffer")
  os.makedirs(buffer_dir, exist_ok=True)
  
  # Create full file path
  file_path = os.path.join(buffer_dir, filename)
  
  try:
    if clipboard_data['type'] == 'text':
      # Save text content
      with open(file_path, 'w', encoding='utf-8') as f:
        f.write(clipboard_data['content'])
      print(f"Text saved to {file_path}")
    else:
      # Save image content
      with open(file_path, 'wb') as f:
        f.write(clipboard_data['content'])
      print(f"Image saved to {file_path}")
    
    # Copy file path to clipboard
    copy_to_clipboard(file_path)
    print(f"File path copied to clipboard: {file_path}")
    
  except Exception as e:
    print(f"Error saving file: {str(e)}")
    sys.exit(1)

if __name__ == "__main__":
  main()
