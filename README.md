# Surfytest: Aurora Sound Wave

An interactive Three.js visualization that turns microphone or shared tab/system audio into a flowing neon aurora. Audio is analyzed in the browser and drives the mesh, lighting, colors, camera movement, and interface glow in real time.

## Features

- Microphone input with echo cancellation, noise suppression, and automatic gain control
- Tab, screen, or supported system-audio capture through the browser's display-sharing interface
- Local-only audio analysis: the app does not record, store, or upload captured audio
- Responsive full-screen WebGL scene with keyboard-accessible controls
- Reduced-motion support and a frame-rate cap to limit unnecessary rendering work
- Automatic cleanup when capture ends, an input is switched, or the page closes

## Run locally

Audio capture requires a secure context. `localhost` is treated as secure by modern browsers, so a simple local server is sufficient:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Do not open `index.html` directly from the filesystem.

The app loads Three.js 0.162.0 from unpkg, so the initial page load requires an internet connection.

## Browser notes

- Microphone capture works in current browsers that support `getUserMedia` and the Web Audio API.
- Device-audio capture depends on `getDisplayMedia`. Chrome and Edge offer the broadest support; the user must explicitly enable audio sharing in the browser's picker.
- Browser and operating-system restrictions determine whether a tab, window, screen, or system-audio track is available.

## Project files

- `index.html` contains the accessible interface and restrictive content security policy.
- `styles.css` provides the responsive neon HUD.
- `app.js` builds the Three.js scene and manages audio capture and cleanup.

## Validation

Run a JavaScript syntax check with:

```sh
node --check app.js
```
