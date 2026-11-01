# Deployment, backups and restore

> Nothing has been deployed. Hosting has a monthly cost and must be approved by the company first.

## Recommended setup (low maintenance)

For three users, one small always-on web service plus a managed Postgres database is enough:

| Piece | Recommendation | Why |
|---|---|---|
| App | **Render Web Service** (Docker, Starter plan) with a **1 GB persistent disk** mounted at `/data` | Runs the included `Dockerfile` unchanged; automatic HTTPS and custom domains; uploaded documents live on the disk |
| Database | **Render Postgres** (Basic) or **Neon** | Managed, encrypted at rest, automated daily backups with point-in-time recovery on paid tiers |

Equivalent alternatives: Railway, Fly.io, or a single cloud VM with Docker. **Avoid purely serverless hosting** (e.g. Vercel functions) unless document storage is moved to object storage, because uploaded files need a persistent disk.

Rough cost at today's list prices: low tens of US dollars per month. Confirm current pricing before committing.

## Step by step (Render)

1. Create a Postgres database. Copy its **internal** connection string and add `?sslmode=require` if connecting externally.
2. Create a Web Service from the GitHub repository, environment **Docker**, branch `main` (after this work is merged).
3. Add a persistent disk: mount path `/data`, 1 GB.
4. Environment variables:
   - `DATABASE_URL` — the connection string
   - `FILE_STORAGE_DIR=/data/storage`
   - `SETUP_TOKEN` — a long random value (used once)
5. Deploy. The container runs `prisma migrate deploy` then starts the app. Check `https://<app>/api/health` returns `{"ok":true}`.
6. Seed units once: open a Render shell and run `npx tsx prisma/reference-data.ts`.
7. Visit `/first-run`, enter the setup token, create the owner, then **remove `SETUP_TOKEN`** from the environment.
8. Turn on two-factor sign-in (Settings → My security), then follow the guided setup.
9. Custom domain: add it in Render, create the DNS record it shows, wait for the certificate.

## Backups

**Layer 1 — the database host.** Enable the provider's automated backups (daily, 7+ days retention; point-in-time recovery if available).

**Layer 2 — your own encrypted copy (database + documents).** Run nightly (Render Cron Job, or any scheduler):

```bash
DATABASE_URL=… FILE_STORAGE_DIR=/data/storage BACKUP_PASSPHRASE=… scripts/backup.sh /data/backups
```

It writes `csc-<timestamp>.tar.gpg` (AES-256) plus a checksum, and keeps the latest 30. Copy the files off the server regularly (e.g. to company cloud storage). **Keep the passphrase somewhere other than the server.**

## Restoring

1. Verify and decrypt:
   ```bash
   sha256sum -c csc-<ts>.tar.gpg.sha256
   gpg --decrypt csc-<ts>.tar.gpg | tar -xf -        # → db.dump, storage.tgz
   ```
2. Restore the database into an **empty** database (create a new one rather than overwriting live data):
   ```bash
   pg_restore --no-owner --dbname="$NEW_DATABASE_URL" db.dump
   ```
3. Restore documents: `tar -xzf storage.tgz -C /data` (creates `/data/storage`).
4. Point `DATABASE_URL` at the restored database, redeploy, and check `/api/health`, a few inventory balances and a document download.
5. Test this procedure once before go-live and then every quarter.

## Updating

Merge to `main` → the host rebuilds the image → migrations apply on start. Migrations are additive. Take a manual backup before any release that includes a migration.
