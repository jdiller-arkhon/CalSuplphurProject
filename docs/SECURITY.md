# Security

## Controls in place

| Area | Control |
|---|---|
| Accounts | Invitation-only (no public sign-up); at most 3 active users; first owner created once via `/first-run` (requires `SETUP_TOKEN` in production) |
| Passwords | argon2id (19 MB memory, t=2); minimum 12 characters with a number or symbol |
| Sessions | 256-bit random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production); only its SHA-256 is stored; 12-hour lifetime; deleted on sign-out, role change, deactivation and recovery |
| MFA | Optional TOTP per user, confirmed with a code before it's enabled; required at every sign-in once on |
| Brute force | Per-IP and per-email login rate limits (Postgres-backed); account lock for 30 minutes after 8 failures; MFA attempts rate-limited |
| Authorization | Role permissions checked on the server for every page, action and API route; Owner permissions for users/settings/audit can't be removed; viewers don't receive cost/value/financial data |
| CSRF | Next.js Server Actions verify the request origin; the logout route checks `Origin`; cookies are `SameSite=Lax` |
| Input | Zod validation on every action; decimal format checks; length limits |
| Output | React escaping; spreadsheet exports neutralize formula injection (`=`, `+`, `-`, `@` prefixes); quote PDFs never print cost or margin |
| Files | Type allow-list, 25 MB limit, magic-byte content check, random opaque storage keys, files outside the web root, served only through an authorized route with `nosniff`, a sandboxing CSP and attachment disposition; confidential documents need a separate permission; downloads are audited |
| Headers | CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy; `X-Powered-By` removed; pages marked `noindex` |
| Audit | Append-only log of sign-ins, failures, every create/update/approve/ship/receive/reverse, role and user changes, exports and downloads |
| Secrets | Only via environment variables; `.env` is git-ignored; no secrets in the repository |
| Data at rest/in transit | Use managed Postgres with encryption at rest and `sslmode=require`; HTTPS enforced by the host; backups encrypted with AES-256 (`scripts/backup.sh`) |
| Email / AI | No outbound email and no data sent to AI services. Invitation and recovery links are shown once to the owner, who sends them personally |

## Recovery

- **Forgotten password / lost phone:** an Owner opens Settings → Users → *Reset access*. This signs the user out, clears their MFA and creates a one-time link valid 24 hours.
- **Owner locked out with no other owner:** a person with database access can run `UPDATE "User" SET "mfaSecret" = NULL, "failedLogins" = 0, "lockedUntil" = NULL WHERE email = '…';` and issue a fresh invitation for that email (see DEPLOYMENT.md). Record it in the audit trail afterwards.

## Assumptions and recommendations

- The host terminates TLS and sets `x-forwarded-proto`; the app is not exposed over plain HTTP.
- Use a least-privilege database role for the app (owner of its schema only, no superuser).
- Turn on MFA for every owner on day one.
- Run `npm audit` and update dependencies monthly; `next` is the most security-sensitive package — keep it on the latest patch release.
