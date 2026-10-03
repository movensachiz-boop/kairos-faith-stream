# Spoken Scripture approval popup

## Goal
When speech recognition detects a Bible reference during a live broadcast, show the found verse immediately in a fixed popup over the live workspace. The host can approve or dismiss it without scrolling.

## Changes
- Move the detected-verse approval card into an accessible modal popup above the live screen.
- Keep listening and captions active while the popup is open.
- Show the verse reference, bold Mont verse text, and clear **Show verse** and **Dismiss** actions.
- Display lookup progress and lookup errors near the live controls so the host knows recognition is working.
- Preserve the selected Scripture background when approving; otherwise use the existing default background.

## Verification
- Simulate a spoken Scripture result and confirm the popup appears regardless of scroll position.
- Confirm **Show verse** puts it on the live output and closes the popup.
- Confirm **Dismiss** closes it without changing the live output.
- Check desktop and phone layouts, then confirm the app has no build errors.
