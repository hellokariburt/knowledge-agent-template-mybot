import articleIndex from '@/fixtures/articles-rag/index.json'
import cardIndex from '@/fixtures/cards-rag/index.json'
import type { ConnectorFetchInput, ConnectorFetchOutput, IngestionConnector, IngestionRecord } from '@/lib/ingestion/connectors/types'

type IndexData = { items: IngestionRecord[] }

function getUpdatedAt(item: IngestionRecord): string | null {
  const value = item.updated_at
  return typeof value === 'string' ? value : null
}

function byUpdatedAtAsc(a: IngestionRecord, b: IngestionRecord): number {
  const left = getUpdatedAt(a) ?? ''
  const right = getUpdatedAt(b) ?? ''
  return left.localeCompare(right)
}

function filterByWatermark(items: IngestionRecord[], watermarkTs: string | null): IngestionRecord[] {
  if (!watermarkTs) return items

  const watermarkMs = Date.parse(watermarkTs)
  if (Number.isNaN(watermarkMs)) return items

  return items.filter((item) => {
    const updatedAt = getUpdatedAt(item)
    if (!updatedAt) return false
    return Date.parse(updatedAt) > watermarkMs
  })
}

function getMaxUpdatedAt(items: IngestionRecord[]): string | null {
  let max: string | null = null
  for (const item of items) {
    const updatedAt = getUpdatedAt(item)
    if (!updatedAt) continue
    if (!max || Date.parse(updatedAt) > Date.parse(max)) {
      max = updatedAt
    }
  }
  return max
}

function parseCursor(cursorToken: string | null): number {
  if (!cursorToken) return 0
  const parsed = Number.parseInt(cursorToken, 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

function getPageSize(): number {
  const fromEnv = process.env.INGEST_MOCK_PAGE_SIZE
  const parsed = Number.parseInt(fromEnv ?? '', 10)
  if (Number.isNaN(parsed) || parsed <= 0) return 500
  return parsed
}

export class MockConnector implements IngestionConnector {
  name = 'mock-fixtures'

  async fetchPage(input: ConnectorFetchInput): Promise<ConnectorFetchOutput> {
    const sourceItems = input.source === 'articles'
      ? (articleIndex as IndexData).items
      : (cardIndex as IndexData).items

    const filtered = filterByWatermark(sourceItems, input.watermarkTs).sort(byUpdatedAtAsc)
    const pageSize = getPageSize()
    const offset = parseCursor(input.cursorToken)
    const items = filtered.slice(offset, offset + pageSize)
    const nextCursorToken = offset + pageSize < filtered.length ? String(offset + pageSize) : null

    return {
      items,
      nextCursorToken,
      maxUpdatedAt: getMaxUpdatedAt(items),
    }
  }
}
