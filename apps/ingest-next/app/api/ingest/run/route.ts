import { NextResponse } from 'next/server'
import { runIngestion } from '@/lib/ingestion/run'

function getRunKey(request: Request): string {
  const incoming = request.headers.get('x-idempotency-key')?.trim()
  return incoming && incoming.length > 0 ? incoming : `manual-${crypto.randomUUID()}`
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await runIngestion({
      trigger: 'manual',
      runKey: getRunKey(request),
      sourceKey: 'all',
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
