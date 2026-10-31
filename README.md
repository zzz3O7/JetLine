# Jetline

Browser prototype of a jet-car stunt racer inspired by Jet Car Stunts 2: a floating race track (Sky Strip)
and a skate-park arena, with jets, air brakes that work as wings, drifting and a live tuning panel.

- `node build.js` builds `dist/jetline.html` (one file, three.js from a CDN) and, after `npm install`, `dist/site/`: a complete website with its own copy of three.js.
- `npm test` runs the physics tests headlessly in Node and checks behavior against the recorded baseline.
- `python3 test/browser-smoke.py` loads the built page in headless Chromium (needs Playwright and `npm install` for three.js).
- How the code is organized, and how it maps to a Unity port: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- What comes next: [docs/ROADMAP.md](docs/ROADMAP.md).

Controls: W/S throttle and brake (in the air with the air brakes or jet: pitch), A/D steer (in the air: roll),
Shift jet (in the air it also lets you pitch and roll while it fires), Space air brakes (hold in a corner for a tight grip turn), Alt handbrake (tap while steering to drift, hold to brake the rear wheels), tap S while steering to drift (in a drift the steering sets the angle; let go or countersteer to straighten out, countersteer + tap S to switch sides), Enter back to checkpoint, R restart,
T tuning, C camera, G ghost, M sound, X drift exit classic / assisted, V drift model classic / continuous (continuous: tap A/D to steer the slide, hold to spin, S while steering = handbrake).

## Hosting on a VPS

`deploy.sh` publishes the game on a Debian/Ubuntu server that already runs nginx. The game is a static page, so nginx serves `/var/www/jetline` directly: no app container, no open port. The page is built with the server's Node if it has Node 18+, otherwise in a throwaway `node:22` Docker container (Docker is installed if missing).

**1. Point the domain at the server.** In Cloudflare, add a DNS record `jetline` with the same type, target and proxy setting as your other subdomains on this server.

**2. Let the VPS read this private repo** with a read-only deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/jetline -N "" -C "jetline deploy"
cat ~/.ssh/jetline.pub
```

Paste the printed line into GitHub: **repo → Settings → Deploy keys → Add deploy key**. Leave "Allow write access" off. Then:

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/jetline" git clone git@github.com:zzz3O7/JetLine.git ~/jetline
cd ~/jetline
git config core.sshCommand "ssh -i ~/.ssh/jetline"
```

**3. Publish:**

```bash
./deploy.sh
```

It asks for the domain (e.g. `jetline.randover.site`), builds the page, copies it to `/var/www/jetline`, adds one nginx site and gets a Let's Encrypt certificate with certbot. Other sites aren't touched; if nginx rejects the new site, it's removed again.

**Later:**

| Command | What it does |
|---|---|
| `./deploy.sh update` | pulls the latest code, rebuilds and publishes it |
| `./deploy.sh nginx jetline.example.com` | (re)creates the nginx site and certificate |

The live build is stamped in the page: `curl -s https://jetline.randover.site | grep jetline-version`.
