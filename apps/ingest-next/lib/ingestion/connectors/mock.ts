import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ConnectorFetchInput, ConnectorFetchOutput, IngestionConnector, IngestionRecord } from '@/lib/ingestion/connectors/types'

type KnowledgePayload = {
  id?: string
  text?: string
  metadata?: Record<string, unknown>
}

function getKnowledgeRoot(): string {
  return path.join(process.cwd(), 'knowledge')
}

function getSourceDir(source: ConnectorFetchInput['source']): string {
  return path.join(getKnowledgeRoot(), source)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

async function readKnowledgePayload(filePath: string): Promise<KnowledgePayload> {
  const raw = await fs.readFile(filePath, 'utf8')
  const trimmed = raw.trim()

  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed) as KnowledgePayload
  }

  return {
    id: path.basename(filePath, path.extname(filePath)),
    text: raw,
    metadata: {},
  }
}

function normalizeArticleRecord(filePath: string, payload: KnowledgePayload, updatedAt: string): IngestionRecord {
  const metadata = asObject(payload.metadata)
  const title = String(metadata.title ?? payload.id ?? path.basename(filePath, path.extname(filePath)))
  const pathname = String(metadata.pathname ?? '')
  const url = pathname ? `https://thepointsguy.com${pathname}` : ''
  const slug = String(metadata.slug ?? slugify(title))

  return {
    id: String(payload.id ?? `article-${slug}`),
    title,
    url,
    updated_at: String(metadata.updated ?? updatedAt),
    path: `knowledge/articles/${path.basename(filePath)}`,
    text: String(payload.text ?? ''),
    metadata,
  }
}

function normalizeCardRecord(filePath: string, payload: KnowledgePayload, updatedAt: string): IngestionRecord {
  const metadata = asObject(payload.metadata)
  const name = String(metadata.name ?? metadata.title ?? payload.id ?? path.basename(filePath, path.extname(filePath)))
  const issuer = String(metadata.issuer ?? '')
  const slug = slugify(String(payload.id ?? name))

  return {
    id: String(payload.id ?? `card-${slug}`),
    name,
    issuer,
    review_url: String(metadata.reviewLink ?? ''),
    updated_at: updatedAt,
    path: `knowledge/cards/${path.basename(filePath)}`,
    text: String(payload.text ?? ''),
    metadata,
  }
}

async function loadSourceItems(source: ConnectorFetchInput['source']): Promise<IngestionRecord[]> {
  const dir = getSourceDir(source)
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = entries
    .filter(entry => entry.isFile())
    .filter(entry => ['.md', '.txt', '.json'].includes(path.extname(entry.name).toLowerCase()))
    .map(entry => path.join(dir, entry.name))

  const records = await Promise.all(files.map(async (filePath) => {
    const stat = await fs.stat(filePath)
    const payload = await readKnowledgePayload(filePath)
    const updatedAt = stat.mtime.toISOString()

    return source === 'articles'
      ? normalizeArticleRecord(filePath, payload, updatedAt)
      : normalizeCardRecord(filePath, payload, updatedAt)
  }))

  return records
}

export class MockConnector implements IngestionConnector {
  name = 'mock-knowledge-files'

  async fetchPage(input: ConnectorFetchInput): Promise<ConnectorFetchOutput> {
    const sourceItems = await loadSourceItems(input.source)
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
