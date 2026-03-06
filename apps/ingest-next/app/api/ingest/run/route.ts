import { promises as fs } from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

async function readIndex(relativePath: string): Promise<{ count: number, items: Array<Record<string, unknown>> }> {
  const filePath = path.join(process.cwd(), relativePath)
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw) as { count: number, items: Array<Record<string, unknown>> }
}

export async function POST() {
  try {
    const articles = await readIndex('fixtures/articles-rag/index.json')
    const cards = await readIndex('fixtures/cards-rag/index.json')

    // Dry-run output: this is the contract your real ingestion run should produce.
    return NextResponse.json({
      status: 'ok',
      dryRun: true,
      summary: {
        articles: articles.count,
        cards: cards.count,
        total: articles.count + cards.count,
      },
      sample: {
        article: articles.items[0] ?? null,
        card: cards.items[0] ?? null,
      },
      next: [
        'replace fixture reader with WP/EKS fetch adapters',
        'write transformed output to snapshot repo workspace',
        'commit/push to snapshot repo',
        'trigger KAT /api/sync',
      ],
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
