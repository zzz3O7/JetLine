#!/usr/bin/env bash
# Hosting Jetline on a Debian/Ubuntu VPS. The game is a static page, so nginx serves it directly:
# no app container, no open port. Node (or a throwaway node:22 Docker container) only builds it.
#
#   ./deploy.sh              build the page and publish it (first run: asks for the domain)
#   ./deploy.sh update       git pull, then build and publish
#   ./deploy.sh nginx DOMAIN (re)create the nginx site for DOMAIN, with a Let's Encrypt certificate
#
# The site files go to /var/www/jetline. Settings (the domain) are kept in .env in this folder.
set -euo pipefail
cd "$(dirname "$0")"

WEBROOT=/var/www/jetline
SITE=jetline   # name of the nginx site file
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
env_get() { grep "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed "s/^'//; s/'$//"; }
set_env() { # set_env KEY VALUE: replace or append a line in .env
  local key="$1" value="$2" rest
  rest=$(grep -v "^${key}=" .env 2>/dev/null || true)
  { [ -n "$rest" ] && printf '%s\n' "$rest"; printf "%s='%s'\n" "$key" "$value"; } > .env
}

# Build dist/site with the local node if it's new enough, otherwise in a throwaway Docker container.
build() {
  local version
  version="$(git log -1 --format='%h, %cs' 2>/dev/null || echo unknown)"
  say "Building ${version}…"
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 \
    && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ]; then
    npm install --no-audit --no-fund --loglevel=error
    JETLINE_VERSION="$version" node build.js
  else
    ensure_docker
    $DOCKER run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e JETLINE_VERSION="$version" \
      -v "$PWD":/src -w /src node:22-alpine \
      sh -c 'npm install --no-audit --no-fund --loglevel=error && node build.js'
  fi
  [ -f dist/site/index.html ] || { echo "The build didn't produce dist/site/index.html." >&2; exit 1; }
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    say "Installing Docker (only used to build the page)…"
    curl -fsSL https://get.docker.com | $SUDO sh
  fi
  if docker info >/dev/null 2>&1; then DOCKER="docker"; else DOCKER="$SUDO docker"; fi
}

# Copy the built files into the web root. index.html goes last, so a visitor never gets a page
# that points at a file that isn't there yet; old versioned files are removed after.
publish() {
  $SUDO mkdir -p "$WEBROOT"
  local f
  for f in dist/site/*; do
    [ "$(basename "$f")" = index.html ] && continue
    $SUDO install -m 644 "$f" "$WEBROOT/"
  done
  $SUDO install -m 644 dist/site/index.html "$WEBROOT/index.html.new"
  $SUDO mv -f "$WEBROOT/index.html.new" "$WEBROOT/index.html"
  for f in "$WEBROOT"/*; do
    [ -e "dist/site/$(basename "$f")" ] || $SUDO rm -f "$f"
  done
  say "Published to ${WEBROOT}: $(grep -o 'jetline-version" content="[^"]*' "$WEBROOT/index.html" | cut -d'"' -f3)"
  local domain
  domain=$(env_get DOMAIN)
  [ -n "$domain" ] && echo "Live at https://${domain} (reload the page to get the new version)"
  return 0
}

# setup_nginx DOMAIN: add one static site to the existing nginx and get a certificate for it.
# Other sites are not touched; if the config test fails, the new site is removed again.
setup_nginx() {
  local domain="$1" conf="/etc/nginx/sites-available/${SITE}" link="/etc/nginx/sites-enabled/${SITE}"
  command -v nginx >/dev/null 2>&1 || { echo "nginx isn't installed here." >&2; exit 1; }
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "That doesn't look like a domain: $domain" >&2; exit 1; }

  say "Adding an nginx site: ${domain} -> ${WEBROOT}"
  sed -e "s|__DOMAIN__|${domain}|" -e "s|__ROOT__|${WEBROOT}|" <<'CONF' | $SUDO tee "$conf" >/dev/null
# Jetline (static). Written by deploy.sh; certbot adds the HTTPS part.
server {
    listen 80;
    listen [::]:80;
    server_name __DOMAIN__;

    root __ROOT__;
    index index.html;

    gzip on;
    gzip_types application/javascript text/javascript text/css;

    location = /index.html {
        add_header Cache-Control "no-cache";    # always check for a new version of the game
    }
    location ~* \.js$ {
        add_header Cache-Control "public, max-age=31536000, immutable";   # file names carry the version
    }
    location / {
        try_files $uri $uri/ =404;
    }
}
CONF
  $SUDO ln -sf "$conf" "$link"
  if ! $SUDO nginx -t; then
    $SUDO rm -f "$link"
    echo "nginx rejected the new site, so I removed it again; your other sites are unchanged." >&2
    exit 1
  fi
  $SUDO systemctl reload nginx

  if ! command -v certbot >/dev/null 2>&1; then
    echo "certbot isn't installed, so there's no HTTPS certificate yet (http://${domain} works)." >&2
    return
  fi
  if $SUDO test -d "/etc/letsencrypt/live/${domain}"; then
    $SUDO certbot install --nginx --cert-name "$domain" -n --redirect || true
  else
    say "Getting a certificate for ${domain}…"
    if ! $SUDO certbot --nginx -d "$domain" --redirect -n; then
      echo "certbot failed (see above). Fix the cause and run: ./deploy.sh nginx ${domain}" >&2
      return
    fi
  fi
  say "Done: https://${domain}"
}

case "${1:-}" in
  update)
    git pull --ff-only
    build
    publish
    ;;
  nginx)
    [ -n "${2:-}" ] || { echo "usage: ./deploy.sh nginx jetline.example.com" >&2; exit 1; }
    set_env DOMAIN "$2"
    [ -f "$WEBROOT/index.html" ] || { build; publish; }
    setup_nginx "$2"
    ;;
  "")
    if [ -z "$(env_get DOMAIN)" ]; then
      read -rp "Domain for the game (e.g. jetline.example.com): " domain
      set_env DOMAIN "$domain"
    fi
    build
    publish
    [ -e "/etc/nginx/sites-enabled/${SITE}" ] || setup_nginx "$(env_get DOMAIN)"
    ;;
  *)
    sed -n '2,9p' "$0"
    exit 1
    ;;
esac
