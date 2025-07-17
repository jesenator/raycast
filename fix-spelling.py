#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Fix Spelling
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📝

# Documentation:
# @raycast.description Fix spelling and grammar of highlighted text using AI
# @raycast.author Jesse Gilbert

import sys
from utils import get_selected_text_or_all, ask_gemini, copy_to_clipboard, paste_text

def main():
  # Get selected text (or all text if nothing selected)
  selected_text, initial_clipboard, active_app = get_selected_text_or_all()

  if not selected_text:
    print("Error: No text to fix")
    sys.exit(1)
  
  if len(selected_text) > 500:
    print("Error: Text is too long (500 character limit)")
    copy_to_clipboard(initial_clipboard)
    sys.exit(1)
  
  # Create prompt for fixing spelling and grammar
  prompt = f"""Fix any spelling and grammar errors in the following text.
Some notes:
- Do NOT add a period to the end of the text
- IMPORTANT: Maintain the original capitalization of the input text (do NOT uppercase the first letter of the text if it wasn't already uppercase)

Return only the corrected text without any explanation or formatting.
  
<text>
{selected_text}
</text>
"""
  
  # Fix the text with Gemini
  corrected_text = ask_gemini(prompt)
  print(f"corrected_text: {corrected_text}")
  
  if not corrected_text:
    # Restore original clipboard if error
    copy_to_clipboard(initial_clipboard)
    sys.exit(1)
  
  # Copy corrected text to clipboard
  if not copy_to_clipboard(corrected_text):
    print("Error: Failed to copy corrected text")
    copy_to_clipboard(initial_clipboard)
    sys.exit(1)
  
  # Paste the corrected text
  paste_text(active_app)
  
  # Show what was changed (truncate if too long)
  original_preview = selected_text[:47] + "..." if len(selected_text) > 50 else selected_text
  corrected_preview = corrected_text[:47] + "..." if len(corrected_text) > 50 else corrected_text

  if selected_text.strip() != corrected_text.strip():
    print(f"Fixed: {original_preview} → {corrected_preview}")
  else:
    print("No changes needed")

if __name__ == "__main__":
  main() 