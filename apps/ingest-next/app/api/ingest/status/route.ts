import { NextResponse } from 'next/server'
import { getRecentRunEvents, getRecentRuns } from '@/lib/ingestion/state'

function isAuthorized(request: Request): boolean {
  const expectedToken = process.env.INGEST_STATUS_SECRET
  if (!expectedToken) return true
  const authHeader = request.headers.get('authorization')
  return authHeader === `Bearer ${expectedToken}`
}

function parseLimit(value: string | null, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) return fallback
  return parsed
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { status: 'error', message: 'Unauthorized status access' },
      { status: 401 },
    )
  }

  try {
    const url = new URL(request.url)
    const runsLimit = parseLimit(url.searchParams.get('runs'), 10)
    const eventsLimit = parseLimit(url.searchParams.get('events'), 25)

    const [runs, events] = await Promise.all([
      getRecentRuns(runsLimit),
      getRecentRunEvents(eventsLimit),
    ])

    return NextResponse.json({
      status: 'ok',
      summary: {
        runs: runs.length,
        events: events.length,
      },
      runs,
      events,
    })
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
