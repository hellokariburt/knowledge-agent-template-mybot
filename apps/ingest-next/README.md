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
