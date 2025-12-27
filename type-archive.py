#!/Users/jesenator/Documents/raycast/.venv/bin/python

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Type Archive
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 📦

# Documentation:
# @raycast.description Navigates to end Notion pages and creates an archive toggle block
# @raycast.author Jesse Gilbert

from pynput.keyboard import Controller, Key
import time

def main():
  keyboard = Controller()
  text = "---> Archive"
  
  time.sleep(0.1)
  
  # Navigate to bottom of document
  keyboard.press(Key.esc)
  keyboard.release(Key.esc)
  time.sleep(0.05)
  
  with keyboard.pressed(Key.cmd):
    keyboard.press(Key.down)
    keyboard.release(Key.down)
  time.sleep(0.05)
  
  keyboard.type('\n')
  time.sleep(0.05)
  keyboard.type('\n')
  time.sleep(0.05)
  keyboard.type('\n')
  time.sleep(0.05)
  keyboard.type('\n')
  
  for _ in range(4):
    with keyboard.pressed(Key.shift):
      keyboard.press(Key.tab)
      keyboard.release(Key.tab)
    time.sleep(0.02)
  
  for char in text:
    if char == '\n':
      keyboard.press(Key.enter)
      keyboard.release(Key.enter)
    else:
      keyboard.type(char)
    time.sleep(0.02)
  
  print("📦 Typed archive block")

if __name__ == "__main__":
  main()

