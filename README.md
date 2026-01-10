# Big Wave Pocket

A pixel-art, SNES/Genesis-inspired Flappy Bird–style surf game built with plain HTML, CSS, and JavaScript. No build tools or external dependencies.

## Run Locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

## Deploy to GitHub Pages

1. Commit the repository.
2. In GitHub, go to **Settings → Pages**.
3. Select the branch (for example, `main`) and root (`/`) folder.
4. Save, then open the provided Pages URL.

## File Structure

```
index.html
styles.css
src/
  main.js
  util.js
manifest.webmanifest
sw.js
```

## Notes for Sprites

Rendering currently uses simple code-drawn shapes for the surfer and wave elements. To add sprites later:

- Load an `Image` in `src/main.js` (e.g., near the top-level constants).
- Replace the `drawPlayer()` body to `drawImage()` the sprite instead of rectangles.
- For wave art, swap `drawWave()` fills and strokes with a spritesheet strip.

## Offline Support

The service worker caches core assets on first load. After the initial visit, the game will work offline when served from a static server.
