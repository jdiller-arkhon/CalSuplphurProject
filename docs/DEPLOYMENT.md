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

## CSC Insights (optional local model)

The assistant uses a model running on hardware you control, so business data never goes to an outside AI service.

- **Tested setup:** llama.cpp server with **Qwen2.5-3B-Instruct** (Q4, ~2 GB file). Needs ~4 GB free RAM and no GPU. On a 4-core CPU an answer takes roughly 20–60 seconds.
- **Install and run** on the same machine as the app (a VM or the Docker host — *not* a small shared web container):
  ```bash
  scripts/local-model.sh install
  scripts/local-model.sh start        # listens on 127.0.0.1:8081 only
  ```
  Run `start` under systemd or a process manager so it restarts on reboot.
- Set `LOCAL_LLM_URL=http://127.0.0.1:8081` for CSC Command, restart it, then an owner turns the assistant on under **CSC Insights**.
- Already use **Ollama** or **LM Studio**? Point `LOCAL_LLM_URL` at it (e.g. `http://127.0.0.1:11434`) and set `LOCAL_LLM_MODEL` to the model name. Any OpenAI-compatible server works.
- A faster machine or a larger model (e.g. 7B) gives better wording; the figures are always computed by CSC Command either way.
- Managed hosts such as Render's small plans don't have the memory for a model. To use the assistant there, run the model on a separate small VM on a private network and point `LOCAL_LLM_URL` at it.

## Updating

Merge to `main` → the host rebuilds the image → migrations apply on start. Migrations are additive. Take a manual backup before any release that includes a migration.
