# Ingestion Service (Next.js)

This app is the starting point for your ingestion pipeline.

## Purpose

- Pull source data (WP/EKS/microservices)
- Transform into deterministic content files
- Push to snapshot repo
- Trigger KAT sync

## Current state

- Uses local fixture data from `fixtures/articles-rag` and `fixtures/cards-rag`
- Includes a starter API route: `POST /api/ingest/run`
- Includes a protected cron route: `GET /api/ingest/cron`
- Includes Vercel cron config (`vercel.json`) running once daily
- Persists run state in Postgres (`ingestion_runs`, `sync_state`)
- Enforces one active run lock per source/environment
- Supports idempotency via `x-idempotency-key` on manual runs
- Supports source selection on manual runs (`all`, `articles`, `cards`)
- Returns reconciliation dry-run (`add`, `update`, `delete`) with sample output paths
- Supports `dryRun` toggle (`true` default for manual runs)
- Supports `publishMode` (`dry-run` default, `local` or `git`)

## Quick start

```bash
cd apps/ingest-next
bun install
bun run dev
```

Test:

```bash
curl -X POST http://localhost:3000/api/ingest/run
```

Run only one source:

```bash
curl -X POST "http://localhost:3000/api/ingest/run?source=articles"
```

Apply manifest changes (non-dry-run):

```bash
curl -X POST \
  -H "Authorization: Bearer $INGEST_MANUAL_SECRET" \
  "http://localhost:3000/api/ingest/run?source=articles&dryRun=false"
```

Local file output publish:

```bash
curl -X POST "http://localhost:3000/api/ingest/run?source=articles&dryRun=true&publishMode=local"
```

Git publish:

```bash
curl -X POST \
  -H "Authorization: Bearer $INGEST_MANUAL_SECRET" \
  "http://localhost:3000/api/ingest/run?source=all&dryRun=false&publishMode=git"
```

## Scheduling

Set these env vars in Vercel for this project:

- `DATABASE_URL` (Neon/Postgres connection string)
- `CRON_SECRET` (shared secret for cron endpoint auth)
- `INGEST_MANUAL_SECRET` (optional; required bearer token for manual privileged runs: `dryRun=false` or `publishMode!=dry-run`)
- `INGEST_STATUS_SECRET` (optional; bearer token for `/api/ingest/status`)
- `PGSSLMODE=disable` (optional for local/non-SSL Postgres only)
- `INGEST_CONNECTOR=mock` (default; connector implementation selector)
- `INGEST_CRON_PUBLISH_MODE` (`dry-run` default; can be `local` or `git`)
- `SNAPSHOT_REPO_URL` + `SNAPSHOT_REPO_TOKEN` + `SNAPSHOT_REPO_BRANCH` (required for `publishMode=git`)
- `KAT_SYNC_URL` + `KAT_SYNC_TOKEN` (optional; trigger KAT sync after successful non-dry-run publish)
Vercel will call:

- `GET /api/ingest/cron` once daily (`0 9 * * *`, UTC)

Note: cron schedule is defined in `vercel.json` and cannot be driven directly by env vars.
The ingestion tables are auto-created on first successful DB-backed run.

Manual test of cron route:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/ingest/cron
```

Manual run with idempotency key:

```bash
curl -X POST \
  -H "x-idempotency-key: ingest-manual-2026-03-09" \
  http://localhost:3000/api/ingest/run
```

Manual run with JSON body source:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"source":"cards"}' \
  http://localhost:3000/api/ingest/run
```

Status endpoint:

```bash
curl -H "Authorization: Bearer $INGEST_STATUS_SECRET" \
  "http://localhost:3000/api/ingest/status?runs=10&events=25"
```

Incremental behavior with mock connector:

1. First run ingests fixture rows and stores per-source watermark.
2. Next run with the same source ingests only rows with `updated_at > watermark`.
3. With static fixtures, repeated runs should quickly return `summary.total = 0`.

Reconciliation behavior:

1. The run response includes file-operation plan counts (`reconciliation.add|update|delete`).
2. This compares deterministic normalized docs against `snapshot_manifest` in Postgres.
3. `dryRun=false` applies manifest state changes in Postgres.

Publish behavior:

1. `publishMode=dry-run` returns planned write/delete counts without filesystem changes.
2. `publishMode=local` writes deterministic output files under:
   - `INGEST_OUTPUT_DIR` if set, else
   - `./.ingest-output` locally, or `/tmp/ingest-output` on Vercel.
3. `publishMode=git` clones snapshot repo, applies file changes, commits, and pushes.
