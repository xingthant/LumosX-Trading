# Deployment Guide

## Does Postgres need separate installation on the VPS?

No. Postgres runs as the `postgres-db` container defined in `docker-compose.yml`,
with its data persisted in the named Docker volume `postgres_data`. As long as
Docker is installed on the VPS, `docker compose up` brings up Postgres, Redis,
and all three app services together — there is nothing extra to install. (If you
later want a managed database with automated backups instead, that's an optional
upgrade, not a requirement.)

## 1. Push this repo to GitHub

From the project root:

```bash
git init
git add .
git commit -m "Initial commit"
```

Then either create the repo on github.com and follow its "push an existing
repository" instructions, or if you have the GitHub CLI installed and
authenticated locally:

```bash
gh repo create YOUR-REPO-NAME --private --source=. --remote=origin --push
```

Before pushing, double check nothing sensitive is staged:

```bash
git status
```

Secrets (DB password, JWT secret, real `.env` files) are gitignored and were
switched to environment-variable placeholders in `docker-compose.yml`, so the
repo itself is safe to make public or private.

## 2. Prepare the VPS

Requirements: a Linux VPS (Ubuntu 22.04/24.04 assumed) with Docker Engine and
the Docker Compose plugin installed, and SSH access.

```bash
# on the VPS
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in after this
```

Open firewall ports 3000 (frontend) and 4000 (backend) — matching the original
design where only those two are public and Postgres/Redis stay internal-only:

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 4000/tcp
sudo ufw allow OpenSSH
sudo ufw enable
```

## 3. Clone and configure

```bash
git clone <your-github-repo-url>
cd <repo-folder>
cp .env.example .env
```

Edit `.env` and set:
- `POSTGRES_PASSWORD` and `JWT_SECRET` — generate strong random values, e.g. `openssl rand -hex 32`
- `CORS_ORIGIN` — your frontend's public origin (or `*` while testing)
- `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` — **the VPS's public IP or domain**, e.g. `http://203.0.113.10:4000`

These two `NEXT_PUBLIC_*` values are baked into the frontend at build time
(Next.js inlines them), so they must point at the address browsers will
actually use — not `localhost` — before you build.

## 4. Build and run

```bash
docker compose up -d --build
docker compose ps
```

Migrations run automatically as part of the backend container's startup
command, so the schema is created on first boot with no manual step.

Visit `http://<vps-ip>:3000` for the app and `http://<vps-ip>:4000` for the API.

## 5. Optional: domain name + HTTPS

For a real domain instead of `http://ip:port`, put a reverse proxy (Caddy or
nginx) in front of ports 3000/4000 with a Let's Encrypt certificate, then point
`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` at the HTTPS domain and rebuild the
frontend. This is a bigger step (DNS + proxy config) — worth doing once you
have a domain ready to point at the VPS.

## 6. Redeploying after changes

```bash
git pull
docker compose up -d --build
```
