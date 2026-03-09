import { ensureSchema, query } from '@/lib/db'

export type RunStatus = 'running' | 'succeeded' | 'failed'

export type StartedRun =
  | { mode: 'started', runId: string, runKey: string }
  | { mode: 'duplicate', runId: string, runKey: string, status: RunStatus }
  | { mode: 'locked' }

type ExistingRunRow = {
  id: string
  run_key: string
  status: RunStatus
}

export type SyncStateRow = {
  source_key: string
  cursor_token: string | null
  watermark_ts: string | null
  last_success_at: string | null
  updated_at: string
}

export type SnapshotManifestRow = {
  source_key: string
  file_path: string
  content_hash: string
}

export async function startRun(input: {
  runId: string
  runKey: string
  sourceKey: string
  environment: string
  trigger: string
}): Promise<StartedRun> {
  await ensureSchema()

  const existing = await query<ExistingRunRow>(
    `SELECT id, run_key, status
       FROM ingestion_runs
      WHERE run_key = $1
      LIMIT 1`,
    [input.runKey],
  )

  if (existing.rows[0]) {
    return {
      mode: 'duplicate',
      runId: existing.rows[0].id,
      runKey: existing.rows[0].run_key,
      status: existing.rows[0].status,
    }
  }

  try {
    await query(
      `INSERT INTO ingestion_runs
       (id, run_key, source_key, environment, trigger, status)
       VALUES ($1, $2, $3, $4, $5, 'running')`,
      [input.runId, input.runKey, input.sourceKey, input.environment, input.trigger],
    )

    return { mode: 'started', runId: input.runId, runKey: input.runKey }
  } catch (error) {
    if (
      error instanceof Error
      && 'code' in error
      && (error as { code?: string }).code === '23505'
    ) {
      const duplicate = await query<ExistingRunRow>(
        `SELECT id, run_key, status
           FROM ingestion_runs
          WHERE run_key = $1
          LIMIT 1`,
        [input.runKey],
      )

      if (duplicate.rows[0]) {
        return {
          mode: 'duplicate',
          runId: duplicate.rows[0].id,
          runKey: duplicate.rows[0].run_key,
          status: duplicate.rows[0].status,
        }
      }

      return { mode: 'locked' }
    }
    throw error
  }
}

export async function finishRunSuccess(input: {
  runId: string
  sourceUpdates: Array<{
    sourceKey: string
    cursorToken: string | null
    watermarkTs: string | null
  }>
  articlesCount: number
  cardsCount: number
  metadata?: Record<string, unknown>
}) {
  await query(
    `UPDATE ingestion_runs
        SET status = 'succeeded',
            ended_at = NOW(),
            articles_count = $2,
            cards_count = $3,
            metadata = $4::jsonb
      WHERE id = $1`,
    [input.runId, input.articlesCount, input.cardsCount, JSON.stringify(input.metadata ?? {})],
  )

  for (const update of input.sourceUpdates) {
    await query(
      `INSERT INTO sync_state (source_key, cursor_token, watermark_ts, last_success_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (source_key)
       DO UPDATE SET
         cursor_token = EXCLUDED.cursor_token,
         watermark_ts = EXCLUDED.watermark_ts,
         last_success_at = EXCLUDED.last_success_at,
         updated_at = NOW()`,
      [update.sourceKey, update.cursorToken, update.watermarkTs],
    )
  }
}

export async function finishRunFailed(input: { runId: string, errorText: string, metadata?: Record<string, unknown> }) {
  await query(
    `UPDATE ingestion_runs
        SET status = 'failed',
            ended_at = NOW(),
            error_text = $2,
            metadata = $3::jsonb
      WHERE id = $1`,
    [input.runId, input.errorText, JSON.stringify(input.metadata ?? {})],
  )
}

export async function getSyncState(sourceKey: string): Promise<SyncStateRow | null> {
  await ensureSchema()

  const result = await query<SyncStateRow>(
    `SELECT source_key, cursor_token, watermark_ts, last_success_at, updated_at
       FROM sync_state
      WHERE source_key = $1
      LIMIT 1`,
    [sourceKey],
  )

  return result.rows[0] ?? null
}

export async function getSnapshotManifestBySources(
  sourceKeys: Array<'articles' | 'cards'>,
): Promise<SnapshotManifestRow[]> {
  await ensureSchema()
  if (sourceKeys.length === 0) return []

  const result = await query<SnapshotManifestRow>(
    `SELECT source_key, file_path, content_hash
       FROM snapshot_manifest
      WHERE source_key = ANY($1::text[])`,
    [sourceKeys],
  )

  return result.rows
}
