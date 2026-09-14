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

Edit `.env` and replace every empty or placeholder value. Generate each secret independently.

Use an alphanumeric Postgres password or percent-encode reserved URL characters in `DATABASE_URL`.
Keep `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` identical.

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

## Mailbox synchronization

Schedule this command every five minutes with cron or a systemd timer:

```sh
curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" https://crm-api.payrolless.co/internal/sync/mailboxes
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
cd /opt/crm
docker compose -f docker-compose.selfhost.yml exec -T postgres pg_dump -U postgres -d crm -Fc > "crm-$(date +%F-%H%M%S).dump"
```

Copy backups away from the VPS. Test restoration regularly on a separate database.

## Not covered

The default deployment excludes the Eve agent. Its Compose service uses the optional `agent` profile.
This guide does not validate Eve without KVM or provide a production sandbox backend.

This deployment does not replace Vercel Blob. External images remain remote when `BLOB_READ_WRITE_TOKEN` is absent.
