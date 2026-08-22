# Swell

A browser-based 3D audio visualizer. Swell turns microphone input or shared tab/device audio into a rolling ocean wave ridden by a tiny cartoon surfer.

## Run locally

Serve the directory from localhost (media permissions do not work when opening `index.html` directly):

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

Device-audio capture uses the browser's screen-sharing picker. Browser and operating-system support varies; in most Chromium browsers, sharing a browser tab and enabling **Share tab audio** gives the most reliable result.
