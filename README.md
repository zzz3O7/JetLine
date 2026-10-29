# Jetline

Browser prototype of a jet-car stunt racer inspired by Jet Car Stunts 2: a floating race track (Sky Strip)
and a skate-park arena, with jets, air brakes that work as wings, drifting and a live tuning panel.

- `node build.js` builds a single self-contained page, `dist/jetline.html` (three.js loads from a CDN).
- `npm test` runs the physics tests headlessly in Node and checks behavior against the recorded baseline.
- `python3 test/browser-smoke.py` loads the built page in headless Chromium (needs Playwright and `npm install` for three.js).
- How the code is organized, and how it maps to a Unity port: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Controls: W/S throttle and brake (in the air with the air brakes held: pitch), A/D steer (in the air: roll),
Shift jet, Space air brakes, tap S while steering to drift (in a drift the steering sets the angle; tuning has a switch to "holding A/D turns the angle"), Enter back to checkpoint, R restart,
T tuning, C camera, G ghost, M sound.
