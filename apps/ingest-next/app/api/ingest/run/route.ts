import { NextResponse } from 'next/server'
import { runIngestion, type IngestionSource } from '@/lib/ingestion/run'

function getRunKey(request: Request): string {
  const incoming = request.headers.get('x-idempotency-key')?.trim()
  return incoming && incoming.length > 0 ? incoming : `manual-${crypto.randomUUID()}`
}

function parseSource(value: unknown): IngestionSource | null {
  if (value === undefined || value === null || value === '') return 'all'
  if (value === 'all' || value === 'articles' || value === 'cards') return value
  return null
}

function parseDryRun(value: unknown): boolean | null {
  if (value === undefined || value === null || value === '') return true
  if (value === true || value === 'true' || value === '1') return true
  if (value === false || value === 'false' || value === '0') return false
  return null
}

export async function POST(request: Request) {
  try {
    let source: IngestionSource = 'all'
    let dryRun = true
    const url = new URL(request.url)
    const sourceFromQuery = parseSource(url.searchParams.get('source'))
    if (sourceFromQuery === null) {
      return NextResponse.json({ status: 'error', message: 'Invalid source query param' }, { status: 400 })
    }
    source = sourceFromQuery
    const dryRunFromQuery = parseDryRun(url.searchParams.get('dryRun'))
    if (dryRunFromQuery === null) {
      return NextResponse.json({ status: 'error', message: 'Invalid dryRun query param' }, { status: 400 })
    }
    dryRun = dryRunFromQuery

    if (!url.searchParams.has('source') || !url.searchParams.has('dryRun')) {
      const contentType = request.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        if (!url.searchParams.has('source')) {
          const sourceFromBody = parseSource(body?.source)
          if (sourceFromBody === null) {
            return NextResponse.json({ status: 'error', message: 'Invalid source in request body' }, { status: 400 })
          }
          source = sourceFromBody
        }
        if (!url.searchParams.has('dryRun')) {
          const dryRunFromBody = parseDryRun(body?.dryRun)
          if (dryRunFromBody === null) {
            return NextResponse.json({ status: 'error', message: 'Invalid dryRun in request body' }, { status: 400 })
          }
          dryRun = dryRunFromBody
        }
      }
    }

    return NextResponse.json(await runIngestion({
      trigger: 'manual',
      runKey: getRunKey(request),
      source,
      dryRun,
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
