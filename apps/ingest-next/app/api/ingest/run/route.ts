import { NextResponse } from 'next/server'
import articles from '@/fixtures/articles-rag/index.json'
import cards from '@/fixtures/cards-rag/index.json'

type IndexData = { count: number, items: Array<Record<string, unknown>> }

export async function POST() {
  try {
    const articleIndex = articles as IndexData
    const cardIndex = cards as IndexData

    // Dry-run output: this is the contract your real ingestion run should produce.
    return NextResponse.json({
      status: 'ok',
      dryRun: true,
      summary: {
        articles: articleIndex.count,
        cards: cardIndex.count,
        total: articleIndex.count + cardIndex.count,
      },
      sample: {
        article: articleIndex.items[0] ?? null,
        card: cardIndex.items[0] ?? null,
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
