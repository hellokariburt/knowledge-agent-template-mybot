import { Pool, type QueryResult } from 'pg'

let pool: Pool | null = null
let schemaReady = false

function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL
  if (!value) {
    throw new Error('Missing DATABASE_URL')
  }
  return value
}

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 5,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    })
  }
  return pool
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query(text, params)
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return

  await query(`
    CREATE TABLE IF NOT EXISTS ingestion_runs (
      id TEXT PRIMARY KEY,
      run_key TEXT UNIQUE NOT NULL,
      source_key TEXT NOT NULL,
      environment TEXT NOT NULL,
      trigger TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      articles_count INTEGER NOT NULL DEFAULT 0,
      cards_count INTEGER NOT NULL DEFAULT 0,
      error_text TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `)

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ingestion_runs_active_lock
    ON ingestion_runs (source_key, environment)
    WHERE status = 'running';
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      source_key TEXT PRIMARY KEY,
      cursor_token TEXT,
      watermark_ts TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  schemaReady = true
}
