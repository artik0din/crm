# Self-hosting on Ubuntu 24.04

This deployment runs the web app, API, Postgres, and Redis with Docker Compose.
nginx terminates TLS and forwards traffic to loopback ports.

## 1. Prepare the server

Install Docker Engine 29 with the Compose plugin. Install nginx and Certbot from Ubuntu packages.

```sh
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo install -d -o "$USER" -g "$USER" /opt/crm
```

Point these DNS records at the VPS before requesting certificates:

- `crm.payrolless.co`
- `crm-api.payrolless.co`

## 2. Clone a release tag

Replace both placeholders with the fork URL and chosen release tag.

```sh
git clone <repository-url> /opt/crm
cd /opt/crm
git checkout <release-tag>
```

Tags give repeatable deployments. Do not deploy an unreviewed development branch.

## 3. Configure the environment

```sh
cp .env.selfhost.example .env
chmod 600 .env
openssl rand -base64 32
```

Edit `.env` and replace every `CHANGE_ME` and empty value. Generate each secret independently.
Each of `POSTGRES_PASSWORD` and `REDIS_PASSWORD` must be at least 24 characters.
Compose refuses to start Postgres, Redis, or migrations while either password is still `CHANGE_ME` or too short.

Percent-encode reserved URL characters in `DATABASE_URL` and `REDIS_URL` (`@`, `:`, `/`, `#`, `?`, `%`).
Example: password `p@ss:w#rd` becomes `p%40ss%3Aw%23rd` in the URL.
Keep `POSTGRES_PASSWORD` and the password segment inside `DATABASE_URL` identical.
Keep `REDIS_PASSWORD` and the password segment inside `REDIS_URL` identical.

Set `AGENT_BRIDGE_SECRET` only when you enable the optional `agent` Compose profile.
Leave it empty for the default stack without Eve.

Create a Google OAuth web client. Register this authorized redirect URI:

```text
https://crm-api.payrolless.co/api/auth/callback/google
```

Enable the Gmail API and Google Calendar API when mailbox synchronization is required.

## 4. Build and start

```sh
cd /opt/crm
docker compose -f docker-compose.selfhost.yml build
docker compose -f docker-compose.selfhost.yml up -d
```

The migration container waits for Postgres. The API starts only after migrations finish successfully.

## 5. Verify health

```sh
docker compose -f docker-compose.selfhost.yml ps
docker compose -f docker-compose.selfhost.yml logs migrate
curl -fsS http://127.0.0.1:5801/health
curl -I http://127.0.0.1:5800/sign-in
```

Postgres, Redis, API, and app must report healthy. The `migrate` service must report exit code `0`.

## 6. Configure nginx and TLS

```sh
sudo cp deploy/nginx/crm.conf.example /etc/nginx/sites-available/crm.conf
sudo ln -s /etc/nginx/sites-available/crm.conf /etc/nginx/sites-enabled/crm.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d crm.payrolless.co -d crm-api.payrolless.co
```

Certbot adds the TLS directives. Do not add them to the example before Certbot runs.

Verify both public endpoints after Certbot finishes:

```sh
curl -fsS https://crm-api.payrolless.co/health
curl -I https://crm.payrolless.co/sign-in
```

## Import enriched leads

Place the CSV outside the git tree. On the VPS:

```sh
sudo install -d -m 700 /opt/crm/import
sudo install -m 600 /path/to/leads_enrichis.csv /opt/crm/import/leads_enrichis.csv
```

The Compose `tools` profile mounts `./import` read-only (use `/opt/crm/import` when the repo lives at `/opt/crm`).

```sh
docker compose -f docker-compose.selfhost.yml --profile tools run --rm tools bun packages/db/scripts/import-leads.ts /import/leads_enrichis.csv --min-score 2
```

The command prints counts only. Re-run it safely to refresh values without creating duplicates.

## Mailbox synchronization

Schedule this command every five minutes with cron or a systemd timer.
It reads `CRON_SECRET` from the running API container, not from the host shell:

```sh
docker compose -f docker-compose.selfhost.yml exec -T api sh -c 'curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" https://crm-api.payrolless.co/internal/sync/mailboxes'
```

The API returns `503` when `CRON_SECRET` is absent. It returns `403` when the secret differs.

## Update to a newer tag

Back up Postgres before each update. Then fetch and select the new release tag.

```sh
cd /opt/crm
git fetch --tags --prune
git checkout <new-release-tag>
docker compose -f docker-compose.selfhost.yml build
docker compose -f docker-compose.selfhost.yml up -d
```

The one-shot migration service runs again. The API waits for its successful completion.

## Back up Postgres

Create a compressed custom-format dump outside the container:

```sh
sudo install -d -m 700 /var/backups/crm
cd /opt/crm
docker compose -f docker-compose.selfhost.yml exec -T postgres pg_dump -U postgres -d crm -Fc > "/var/backups/crm/crm-$(date +%F-%H%M%S).dump"
```

Copy backups away from the VPS. Test restoration regularly on a separate database.
Never store `.dump` files inside the git clone (`import/` and `*.dump` are ignored).

## Not covered

The default deployment excludes the Eve agent. Its Compose service uses the optional `agent` profile.
This guide does not validate Eve without KVM or provide a production sandbox backend.

This deployment does not replace Vercel Blob. External images remain remote when `BLOB_READ_WRITE_TOKEN` is absent.
