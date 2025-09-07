#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Realistic Type Clipboard
# @raycast.mode silent

# Optional parameters:
# @raycast.icon ⌨️

# Documentation:
# @raycast.description Type clipboard content with realistic human-like behavior including typos and corrections
# @raycast.author Jesse Gilbert

import sys
import time
import random
import re
from utils import get_clipboard_content
from pynput.keyboard import Controller, Key

# Global speed multiplier - 0.33 = 3x faster
SPEED_MULTIPLIER = 0.1

def type_character(char, keyboard_controller):
  """Type a single character using pynput."""
  if char == '\n':
    keyboard_controller.press(Key.enter)
    keyboard_controller.release(Key.enter)
  elif char == '\t':
    keyboard_controller.press(Key.tab)
    keyboard_controller.release(Key.tab)
  else:
    keyboard_controller.type(char)

def backspace(keyboard_controller, count=1):
  """Send backspace keystrokes using pynput."""
  for _ in range(count):
    keyboard_controller.press(Key.backspace)
    keyboard_controller.release(Key.backspace)
    # Keep backspace timing reasonable even when sped up
    time.sleep(max(0.01, random.uniform(0.02, 0.05) * SPEED_MULTIPLIER))


def should_make_typo():
  """Determine if we should make a typo (about 8% chance - faster typists make fewer errors)."""
  return random.random() < 0.08

def get_common_typo(char):
  """Get a common typo for a character based on keyboard layout."""
  # Common typos based on QWERTY keyboard proximity
  typo_map = {
    'a': ['s', 'q', 'z'],
    'b': ['v', 'n', 'g'],
    'c': ['x', 'v', 'f'],
    'd': ['s', 'f', 'r'],
    'e': ['w', 'r', 'd'],
    'f': ['d', 'g', 'c'],
    'g': ['f', 'h', 't'],
    'h': ['g', 'j', 'y'],
    'i': ['u', 'o', 'k'],
    'j': ['h', 'k', 'u'],
    'k': ['j', 'l', 'i'],
    'l': ['k', 'o'],
    'm': ['n', 'j'],
    'n': ['b', 'm', 'h'],
    'o': ['i', 'p', 'l'],
    'p': ['o', 'l'],
    'q': ['w', 'a'],
    'r': ['e', 't', 'f'],
    's': ['a', 'd', 'w'],
    't': ['r', 'y', 'g'],
    'u': ['y', 'i', 'j'],
    'v': ['c', 'b', 'f'],
    'w': ['q', 'e', 's'],
    'x': ['z', 'c', 'd'],
    'y': ['t', 'u', 'h'],
    'z': ['x', 'a']
  }
  
  char_lower = char.lower()
  if char_lower in typo_map:
    return random.choice(typo_map[char_lower])
  return char

def get_typing_delay():
  """Get a realistic typing delay (varies between fast and slow)."""
  # More realistic typing speed - targeting 80-150 WPM, but 3x faster
  base_delay = random.uniform(0.05, 0.15) * SPEED_MULTIPLIER
  
  # Add some natural variation and occasional longer pauses
  if random.random() < 0.08:  # 8% chance of hesitation
    base_delay += random.uniform(0.1, 0.4) * SPEED_MULTIPLIER
  
  return base_delay

def get_punctuation_pause(char):
  """Get additional pause time for punctuation marks."""
  pause_chars = {
    '.': random.uniform(0.2, 0.5) * SPEED_MULTIPLIER,
    '!': random.uniform(0.2, 0.4) * SPEED_MULTIPLIER,
    '?': random.uniform(0.2, 0.4) * SPEED_MULTIPLIER,
    ',': random.uniform(0.05, 0.15) * SPEED_MULTIPLIER,
    ';': random.uniform(0.1, 0.25) * SPEED_MULTIPLIER,
    ':': random.uniform(0.1, 0.25) * SPEED_MULTIPLIER,
    '\n': random.uniform(0.3, 0.8) * SPEED_MULTIPLIER,
    '\t': random.uniform(0.05, 0.15) * SPEED_MULTIPLIER
  }
  return pause_chars.get(char, 0)

def should_hesitate_at_word_boundary(text, pos):
  """Check if we should hesitate at a word boundary (longer words, complex words)."""
  if pos == 0 or text[pos] != ' ':
    return False
  
  # Look at the next word
  next_word_start = pos + 1
  next_word_end = next_word_start
  while next_word_end < len(text) and text[next_word_end] not in ' \n\t.,!?;:':
    next_word_end += 1
  
  if next_word_end <= next_word_start:
    return False
  
  next_word = text[next_word_start:next_word_end].lower()
  
  # Much less frequent hesitation and shorter pauses
  if len(next_word) > 10:  # Only very long words
    return random.random() < 0.1
  
  # Rarely hesitate before complex words
  if any(pattern in next_word for pattern in ['ph', 'gh', 'tion', 'sion', 'ough']):
    return random.random() < 0.05
  
  return False

def realistic_type_text(text):
  """Type text with realistic human behavior."""
  print(f"⌨️  Starting to type {len(text)} characters...")
  
  # Initialize keyboard controller
  keyboard_controller = Controller()
  
  i = 0
  while i < len(text):
    char = text[i]
    
    # Check for hesitation at word boundaries
    if should_hesitate_at_word_boundary(text, i):
      time.sleep(random.uniform(0.2, 0.8) * SPEED_MULTIPLIER)
    
    # Decide if we should make a typo
    if should_make_typo() and char.isalpha():
      # Make a typo
      typo_char = get_common_typo(char)
      type_character(typo_char, keyboard_controller)
      
      # Brief pause as human realizes mistake
      time.sleep(random.uniform(0.05, 0.2) * SPEED_MULTIPLIER)
      
      # Backspace to correct
      backspace(keyboard_controller)
      
      # Slight pause before typing correct character
      time.sleep(random.uniform(0.02, 0.1) * SPEED_MULTIPLIER)
      
      # Type the correct character
      type_character(char, keyboard_controller)
    else:
      # Type normally
      type_character(char, keyboard_controller)
    
    # Base typing delay
    time.sleep(get_typing_delay())
    
    # Additional pause for punctuation
    punct_pause = get_punctuation_pause(char)
    if punct_pause > 0:
      time.sleep(punct_pause)
    
    i += 1
    
    # Progress indicator for long text
    if len(text) > 100 and i % 50 == 0:
      print(f"Progress: {i}/{len(text)} characters ({i*100//len(text)}%)")

def main():
  clipboard_data = get_clipboard_content()
  
  if not clipboard_data:
    print("❌ Clipboard is empty")
    return
  
  if clipboard_data['type'] != 'text':
    print("❌ Clipboard doesn't contain text")
    return
  
  text = clipboard_data['content']
  
  if not text.strip():
    print("❌ Clipboard text is empty")
    return
  
  # Limit text length for practical use
  if len(text) > 2000:
    print("⚠️  Text is very long (>2000 chars). This might take a while!")
    print("Consider using shorter text for better experience.")
    response = input("Continue anyway? (y/N): ")
    if response.lower() != 'y':
      return
  
  print(f"📝 Text length: {len(text)} characters")
  print("⌨️  Starting realistic typing now...")
  
  try:
    realistic_type_text(text)
    print("✅ Finished typing!")
  except KeyboardInterrupt:
    print("\n⏹️  Typing interrupted by user")
  except Exception as e:
    print(f"❌ Error during typing: {str(e)}")

if __name__ == "__main__":
  main()
