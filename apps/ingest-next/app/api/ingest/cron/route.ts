import { NextResponse } from 'next/server'
import { runIngestion } from '@/lib/ingestion/run'

function isAuthorized(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET
  if (!expectedSecret) return false

  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${expectedSecret}`
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
    return NextResponse.json(await runIngestion({
      trigger: 'cron',
      runKey: `cron-all-${utcDay}`,
      source: 'all',
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
