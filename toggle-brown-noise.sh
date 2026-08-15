#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Brown Noise
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔊

# Documentation:
# @raycast.description Start or stop looping brown noise
# @raycast.author Jesse Gilbert

PID_FILE="/tmp/raycast-brown-noise.pid"
NOISE_FILE="/tmp/raycast-brown-noise.wav"

# If already playing, stop it
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  kill "$(cat "$PID_FILE")" 2>/dev/null
  pkill -f "afplay.*$NOISE_FILE" 2>/dev/null
  rm -f "$PID_FILE"
  echo "Brown noise stopped"
  exit 0
fi
rm -f "$PID_FILE"

# Generate 60s of brown noise once (leaky integration of white noise)
if [ ! -f "$NOISE_FILE" ]; then
  python3 - "$NOISE_FILE" <<'EOF'
import sys, wave, random, struct
rate, secs = 44100, 60
n = rate * secs
fade = int(rate * 0.03)
last = 0.0
frames = bytearray()
for i in range(n):
  white = random.uniform(-1, 1)
  last = (last + 0.02 * white) / 1.02
  s = max(-1.0, min(1.0, last * 3.5))
  # short fade at the edges so the loop seam doesn't click
  if i < fade:
    s *= i / fade
  elif i > n - fade:
    s *= (n - i) / fade
  frames += struct.pack("<h", int(s * 32767))
with wave.open(sys.argv[1], "w") as w:
  w.setnchannels(1)
  w.setsampwidth(2)
  w.setframerate(rate)
  w.writeframes(bytes(frames))
EOF
fi

# Loop playback in the background, detached so it survives the script exiting
nohup bash -c "while :; do afplay -v 0.5 \"$NOISE_FILE\"; done" >/dev/null 2>&1 &
echo $! > "$PID_FILE"
disown

echo "Brown noise started"
