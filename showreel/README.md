# Motion Reel 2026

A 15-second, 1920×1080 / 60 fps showreel: **`showreel.mp4`**.

Every frame is a pure function of time, drawn on a canvas in `reel.html`, so frames can be rendered in any order and blended into real motion blur (6 samples per frame, 180° shutter). The soundtrack is generated in code at 120 BPM, and every hit lines up with the picture.

| Time | Scene | What it shows |
| --- | --- | --- |
| 0–2s | Squash & stretch | A ball that obeys real gravity, with onion skins and live scale readouts |
| 2–4s | Kinetic type | "I MAKE THINGS MOVE." one word per beat, whip-panel cuts, a slice transition |
| 4–6s | Systems | A 16×9 grid where beat-driven waves morph shapes and colours, then a vortex and iris |
| 6–9s | Particles | 2,200 particles go from the grid to a sphere, a torus, the word MOTION, then explode |
| 9–11s | Timing | Linear, ease and elastic motion side by side, with graph-editor curves; the sound wobble follows the elastic curve |
| 11–13s | Cuts | Eight quarter-second pieces: burst, rings, halftone, stripes, counter, spiral, glitch, checker flip |
| 13–15s | Identity | The wordmark lands, and the opening ball comes back as the full stop |

## Rebuild

```sh
node gen-audio.mjs     # -> audio.wav
node render.mjs        # -> frames/ (headless Chromium via Playwright)
ffmpeg -framerate 60 -i frames/f%04d.png -i audio.wav -c:v libx264 -preset slow -crf 20 \
  -pix_fmt yuv420p -c:a aac -b:a 256k -af volume=-2dB -movflags +faststart -shortest showreel.mp4
```

To watch a live preview, serve this folder and open `reel.html`. Click to pause, or add `?t=9` to start at 9 seconds.

Fonts (Archivo Black, JetBrains Mono, Instrument Serif, Space Grotesk) come from Google Fonts under the SIL Open Font License.
