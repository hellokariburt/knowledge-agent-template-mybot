import { NextResponse } from 'next/server'
import { runIngestion } from '@/lib/ingestion/run'
import type { PublishMode } from '@/lib/ingestion/publish'

function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${expectedSecret}`
}

function getCronPublishMode(): PublishMode {
  const value = process.env.INGEST_CRON_PUBLISH_MODE
  if (value === 'local' || value === 'git' || value === 'dry-run') return value
  return 'dry-run'
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized cron trigger' },
      { status: 401 },
    )
  }

  try {
    const utcDay = new Date().toISOString().slice(0, 10)
    const publishMode = getCronPublishMode()
    return NextResponse.json(await runIngestion({
      trigger: 'cron',
      runKey: `cron-all-${utcDay}`,
      source: 'all',
      dryRun: false,
      publishMode,
    }))
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
