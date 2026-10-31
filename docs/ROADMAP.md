# Roadmap

PC (keyboard) first: get the feel right there, then port to phone and gamepad. Jet Car Stunts 2 is the
inspiration, not the target. Each feature is judged by whether it's fun and fits this game, not by how
closely it matches the original.

Steps are in build order; each builds on the ones before it. Tick them off as PRs land.

## 0. Hosting
- [x] `deploy.sh` and the self-contained site build (PR #8)
- [x] First deploy: DNS record `jetline` in Cloudflare, read-only deploy key, `./deploy.sh` on the VPS
      (domain `jetline.randover.site`). After that every merge goes live with `./deploy.sh update`.

## 1. Controls and air brake rules (PC)
- [x] Input layer: the game core only sees intents (steer, throttle, brake, jet, air brake, handbrake);
      keyboard input is translated into them in one place, so a phone or gamepad port later doesn't
      touch the physics. Steering limit stays a keyboard setting.
- [x] Handbrake on **Alt**: a tap while steering starts a drift, holding it brakes the rear wheels.
      S still starts drifts too (and stays brake / reverse). If a browser misbehaves with Alt, S covers it.
- [x] Air brakes in the air: drag plus air control. Keep the current lift (gliding) for now.
- [x] Air brakes on the ground: downforce, as now (grip through load, so it also works on walls and
      ceilings at speed), and it keeps costing speed.
- [x] Boost also unlocks air control, but only while the jet is actually firing (needs fuel).
- [x] Wings stay on the car model as the air brakes.

## 2. Drift: spins
- [x] Tried a continuous drift (no drift state, steering sets how fast the slide angle changes; PR #11, closed):
      it felt slow and unintuitive. The classic drift stays.
- [x] Handbrake locks the rear wheels (S while steering on keyboard, Alt where the browser allows it). In a drift
      it releases the angle hold while pressed: a short press swings the car wider and the drift catches it again,
      too long spins you out. Rotation built on the ground carries on in the air (spin before a ramp).
- [ ] Playtest; tune the catch range (driftMaxAngle) and how hard the locked wheels slide (handbrakeGrip).

## 3. Cars
Tracks are designed around a car's specialty, so the cars come first.
- [ ] Per-car tuning: air brake lift, drag and control strength, jet tank size and recharge
      (tank refills at checkpoints).
- [ ] A few cars with different characters, specialties and signature moves (a glider, a car that
      punishes correcting in the air, ...). Prototype each on small hand-built test tracks like the Hairpin.

## 4. Track editor
- [ ] Build tracks from pieces (corners by radius and bank, ramps, gaps, loops), live preview,
      instant test drive, share a track as a code. Race tracks first, free placement later.
- [ ] Tracks designed for each car's specialty.

## Later
- Re-balance drift risk against reward once the drift model is settled.
- Key rebinding.
- Unity port (handbrake on Alt).

### Phone and gamepad port (decisions so far)
- Same physics and the same drift as PC; only the input mapping differs.
- No steering limit on phone or gamepad: analog steering, so oversteering starts drifts (and can spin).
- Phone: tilt-only steering (no fallback buttons). On the ground tilt steers; in the air it rolls and
  pitches, gas / reverse are not involved. Calibration: neutral position, sensitivity, pitch invert,
  landscape lock, iPhone motion permission (needs HTTPS).
- Phone layout: boost, air brake and handbrake under the left thumb; gas and reverse under the right;
  a back-to-checkpoint button; restart and menu at the top.
- Gamepads behave like phones (analog, no steering limit).
- A simulated-tilt test driver in CI.
