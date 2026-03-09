import { withRetry } from '@/lib/ingestion/retry'

export type SyncTriggerResult = {
  attempted: boolean
  success: boolean
  statusCode: number | null
  url: string | null
  message: string
}

export async function triggerKatSync(input: {
  runId: string
  source: string
}): Promise<SyncTriggerResult> {
  const syncUrl = process.env.KAT_SYNC_URL
  if (!syncUrl) {
    return {
      attempted: false,
      success: false,
      statusCode: null,
      url: null,
      message: 'KAT_SYNC_URL not configured; sync skipped',
    }
  }

  const syncToken = process.env.KAT_SYNC_TOKEN
  const attempts = Number.parseInt(process.env.KAT_SYNC_RETRY_ATTEMPTS ?? '3', 10)
  const delayMs = Number.parseInt(process.env.KAT_SYNC_RETRY_DELAY_MS ?? '500', 10)

  const response = await withRetry({
    attempts: Number.isNaN(attempts) ? 3 : Math.max(attempts, 1),
    initialDelayMs: Number.isNaN(delayMs) ? 500 : Math.max(delayMs, 100),
    factor: 2,
    operation: async () => fetch(syncUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(syncToken ? { Authorization: `Bearer ${syncToken}` } : {}),
      },
      body: JSON.stringify({
        trigger: 'ingestion-pipeline',
        runId: input.runId,
        source: input.source,
      }),
    }),
  })

  if (!response.ok) {
    return {
      attempted: true,
      success: false,
      statusCode: response.status,
      url: syncUrl,
      message: `KAT sync failed with status ${response.status}`,
    }
  }

  return {
    attempted: true,
    success: true,
    statusCode: response.status,
    url: syncUrl,
    message: 'KAT sync triggered',
  }
}
