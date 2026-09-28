# Multi-camera live and three-color interface

## Build
- Add a camera pairing page opened from a QR code during an active broadcast.
- Let the main broadcaster connect Camera 2 and Camera 3, see their previews, and switch the live shot.
- Keep Camera 1 as the only live audio source; paired phones send video only.
- Show connection status and allow each paired camera to disconnect cleanly.
- Replace the frosted/aurora visual style with a flat white interface, soft green actions, and restrained red live/error accents.

## Technical details
- Extend the existing realtime/WebRTC signaling with a separate camera-link channel and per-camera peer connection.
- Produce one stable outgoing MediaStream so switching cameras does not interrupt connected viewers.
- Generate QR codes in the browser using a local package; no external image service or new database table is required.
- Preserve existing live comments, background music, giving emphasis, and small-audience broadcast behavior.

## Verification
- Check Camera 1 broadcast, QR pairing for Cameras 2 and 3, shot switching, video-only remote tracks, and viewer playback.
- Review Create and Live pages at desktop and phone sizes, then confirm the preview has no build or runtime errors.
