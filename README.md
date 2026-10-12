# Expense Tracker — AWS Hands-On Learning Project

A deliberately small expense tracker, used as the payload for learning AWS
hosting end to end. **The app is the vehicle, not the product** — it gets built,
deployed through a production-style AWS stack, studied, then deleted.

Full phase-by-phase plan: `~/.claude/plans/glowing-booping-sparrow.md`
Concepts and notes as we go: [`docs/aws-notes.md`](docs/aws-notes.md)

**Region:** `ap-southeast-2` (Sydney) · **Account:** AWS Free plan, no charges possible

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript + Vite, hand-written PWA (manifest + service worker) |
| Backend | Node + TypeScript + Express + `pg` |
| Database | PostgreSQL 16 |
| Packaging | Docker + Docker Compose |

## Run it locally

```bash
docker compose up -d --build
```

| URL | What |
|---|---|
| https://d3e7irv07htoun.cloudfront.net | **Live site** — HTTPS via CloudFront |
| http://localhost:8080 | The app, served by nginx with `/api/*` proxied to the backend |
| (on EC2: port 80) | Set `WEB_PORT=80` in a server-side `.env` — see Phase 3 notes |
| http://localhost:3000 | The API directly |
| http://localhost:3000/health | What the ALB will poll in Phase 7 |
| localhost:5432 | Postgres (`expense` / `expense` / `expense`) |

**Use port 8080, not 5173.** It mirrors the production topology — one origin
serving both the UI and the API — which is why CORS never comes up.

For frontend hot-reload while developing:

```bash
cd frontend && npm run dev      # :5173, proxies /api to :3000
```

## API

```
GET    /health                      → 200 {status:"ok"} | 503 when unhealthy
GET    /api/categories
GET    /api/expenses?month=YYYY-MM&category_id=&q=
POST   /api/expenses
PUT    /api/expenses/:id
DELETE /api/expenses/:id
GET    /api/dashboard?month=YYYY-MM
POST   /api/expenses/:id/receipt    → 501 until Phase 5 (S3 + IAM)
```

## Three deliberate design choices

These exist because AWS needs them, and each one is load-bearing later:

1. **All config from environment variables** (`backend/src/config.ts`). The same
   image runs on your laptop, on EC2 with local Postgres, and on EC2 against
   RDS, with no code change.
2. **A real `/health` endpoint** (`backend/src/index.ts`). Returns 503 if the DB
   is unreachable, or if `FORCE_UNHEALTHY=true`. That flag exists so Phase 7 can
   watch the ALB drain a target on command:
   ```bash
   FORCE_UNHEALTHY=true docker compose up -d api
   ```
3. **Stateless, and it drains on SIGTERM.** No local disk writes, and in-flight
   requests finish before exit — the precondition for an Auto Scaling Group
   replacing instances without dropping requests.

## Migrations

`backend/migrations/*.sql`, applied in order by a runner that records what it
has run. Compose runs it on boot; in **Phase 4 you run it by hand against RDS**,
which is why it's a script rather than a Postgres initdb hook.

```bash
cd backend && npm run migrate
```

## Phase status

- [x] **Phase 1** — local app, Docker Compose, CRUD + filters + dashboard
- [x] **Phase 0** — AWS account (Free plan, new Builder Experience), $5 budget on unblended costs
- [x] Phase 2 — VPC (4 subnets across 2 AZs, IGW, public/private route tables)
- [x] Phase 3 — EC2 + Docker, app live on the public internet
- [x] Phase 4 — RDS (private subnets, SG chaining, Secrets Manager credentials)
- [x] Phase 5 — S3 + IAM role, receipts via pre-signed URLs, zero credentials
- [x] Phase 6 — CloudFront + HTTPS, edge caching, PWA installable
- [x] Phase 7 — ALB + Auto Scaling across 2 AZs, self-healing verified
- [~] Phase 8 — CloudWatch: metrics + alarms done; log shipping pending  ← **you are here**
- [ ] Phase 9 — CI/CD
- [ ] Phase 10 — Terraform (`infra/`)
- [ ] Phase 11 — Teardown + cost post-mortem

## Note on Node

The host runs Node 18. `vite-plugin-pwa` needs Node 20, so the PWA manifest and
service worker are hand-written instead (`frontend/public/`). The Docker images
build on `node:20-alpine`, so containers are unaffected.
