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

export async function POST(request: Request) {
  try {
    let source: IngestionSource = 'all'
    const url = new URL(request.url)
    const sourceFromQuery = parseSource(url.searchParams.get('source'))
    if (sourceFromQuery === null) {
      return NextResponse.json({ status: 'error', message: 'Invalid source query param' }, { status: 400 })
    }
    source = sourceFromQuery

    if (!url.searchParams.has('source')) {
      const contentType = request.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = await request.json().catch(() => ({} as Record<string, unknown>))
        const sourceFromBody = parseSource(body?.source)
        if (sourceFromBody === null) {
          return NextResponse.json({ status: 'error', message: 'Invalid source in request body' }, { status: 400 })
        }
        source = sourceFromBody
      }
    }

    return NextResponse.json(await runIngestion({
      trigger: 'manual',
      runKey: getRunKey(request),
      source,
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
