# new-script

Notes for adding a new Raycast custom script
- Look at the other files in the folder for refence
- No need to chmod it
- You can write it in Python or Bash, whichever is easier/makes more sense for this particular custom script
- You can use utils from @utils.py / @utils.sh  and/or make new ones (if the function is likely to be used in other scripts)
- Keep it really simple!!!

The particulars of the script you are being asked to write will be provided by the user.

## Reference

### Raycast Script Modes (`@raycast.mode`)
- `silent` - Last line shown in small HUD toast at the bottom of the screen
- `compact` - Last line shown in compact Raycast window line toast
- `fullOutput` - Entire output in scrollable terminal-like view
- `inline` - First line shown in command item (requires `@raycast.refreshTime`)