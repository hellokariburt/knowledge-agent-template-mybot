import { createHash } from 'node:crypto'
import type { IngestionRecord } from '@/lib/ingestion/connectors/types'

export type DeterministicDoc = {
  sourceKey: 'articles' | 'cards'
  path: string
  content: string
  contentHash: string
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function stableStringifyObject(input: Record<string, unknown>): string {
  const sortedKeys = Object.keys(input).sort()
  const sorted: Record<string, unknown> = {}
  for (const key of sortedKeys) sorted[key] = input[key]
  return JSON.stringify(sorted, null, 2)
}

export function normalizeArticle(record: IngestionRecord): DeterministicDoc {
  const id = String(record.id ?? '')
  const title = String(record.title ?? '')
  const url = String(record.url ?? '')
  const updatedAt = String(record.updated_at ?? '')
  const sourcePath = String(record.path ?? '')
  const bodyText = String(record.text ?? '')

  const slugBase = sourcePath.split('/').pop()?.replace(/\.md$/i, '') || id || title || 'article'
  const slug = toSlug(slugBase)
  const outputPath = `docs/articles/${slug}.md`
  const content = [
    '---',
    `id: ${id}`,
    `title: ${title}`,
    `url: ${url}`,
    `updated_at: ${updatedAt}`,
    `source_path: ${sourcePath}`,
    '---',
    '',
    bodyText.length > 0 ? bodyText : `# ${title}`,
  ].join('\n')

  return {
    sourceKey: 'articles',
    path: outputPath,
    content,
    contentHash: hashContent(content),
  }
}

export function normalizeCard(record: IngestionRecord): DeterministicDoc {
  const id = String(record.id ?? '')
  const name = String(record.name ?? '')
  const issuer = String(record.issuer ?? '')
  const reviewUrl = String(record.review_url ?? '')
  const updatedAt = String(record.updated_at ?? '')

  const slug = toSlug(id || name || 'card')
  const outputPath = `docs/cards/${slug}.json`
  const content = stableStringifyObject({
    id,
    name,
    issuer,
    review_url: reviewUrl,
    updated_at: updatedAt,
    source_record: record,
  })

  return {
    sourceKey: 'cards',
    path: outputPath,
    content,
    contentHash: hashContent(content),
  }
}
