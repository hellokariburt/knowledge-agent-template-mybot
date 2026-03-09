import articles from '@/fixtures/articles-rag/index.json'
import cards from '@/fixtures/cards-rag/index.json'
import { finishRunFailed, finishRunSuccess, getSyncState, startRun } from '@/lib/ingestion/state'

export type IngestionTrigger = 'manual' | 'cron'
export type IngestionSource = 'all' | 'articles' | 'cards'

type IndexData = { count: number, items: Array<Record<string, unknown>> }

export type IngestionRunResult = {
  status: 'ok' | 'skipped'
  dryRun: boolean
  runId: string
  runKey: string
  trigger: IngestionTrigger
  mode: 'started' | 'duplicate' | 'locked'
  environment: string
  source: IngestionSource
  cursor: {
    articles: string | null
    cards: string | null
  }
  watermark: {
    articles: string | null
    cards: string | null
  }
  summary: {
    articles: number
    cards: number
    total: number
  }
  sample: {
    article: Record<string, unknown> | null
    card: Record<string, unknown> | null
  }
  next: string[]
}

type RunIngestionInput = {
  trigger: IngestionTrigger
  runKey: string
  source: IngestionSource
}

export async function runIngestion(input: RunIngestionInput): Promise<IngestionRunResult> {
  const articleIndex = articles as IndexData
  const cardIndex = cards as IndexData
  const sourceKey = input.source
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development'
  const runId = crypto.randomUUID()

  const articleState = await getSyncState('articles')
  const cardState = await getSyncState('cards')

  const runStart = await startRun({
    runId,
    runKey: input.runKey,
    sourceKey,
    environment,
    trigger: input.trigger,
  })

  if (runStart.mode === 'locked') {
    return {
      status: 'skipped',
      dryRun: true,
      runId,
      runKey: input.runKey,
      trigger: input.trigger,
      mode: 'locked',
      environment,
      source: input.source,
      cursor: {
        articles: articleState?.cursor_token ?? null,
        cards: cardState?.cursor_token ?? null,
      },
      watermark: {
        articles: articleState?.watermark_ts ?? null,
        cards: cardState?.watermark_ts ?? null,
      },
      summary: {
        articles: 0,
        cards: 0,
        total: 0,
      },
      sample: {
        article: null,
        card: null,
      },
      next: [
        'another run is active for this source/environment',
        'retry this trigger after the active run completes',
      ],
    }
  }

  if (runStart.mode === 'duplicate') {
    return {
      status: 'skipped',
      dryRun: true,
      runId: runStart.runId,
      runKey: input.runKey,
      trigger: input.trigger,
      mode: 'duplicate',
      environment,
      source: input.source,
      cursor: {
        articles: articleState?.cursor_token ?? null,
        cards: cardState?.cursor_token ?? null,
      },
      watermark: {
        articles: articleState?.watermark_ts ?? null,
        cards: cardState?.watermark_ts ?? null,
      },
      summary: {
        articles: 0,
        cards: 0,
        total: 0,
      },
      sample: {
        article: null,
        card: null,
      },
      next: [
        `idempotency key already used (existing run status: ${runStart.status})`,
        'use a new run key for a fresh run',
      ],
    }
  }

  try {
    const includeArticles = input.source === 'all' || input.source === 'articles'
    const includeCards = input.source === 'all' || input.source === 'cards'
    const sourceKeysToUpdate = [
      ...(includeArticles ? ['articles'] : []),
      ...(includeCards ? ['cards'] : []),
    ]

    const articleCount = includeArticles ? articleIndex.count : 0
    const cardCount = includeCards ? cardIndex.count : 0

    const result: IngestionRunResult = {
      status: 'ok',
      dryRun: true,
      runId: runStart.runId,
      runKey: input.runKey,
      trigger: input.trigger,
      mode: 'started',
      environment,
      source: input.source,
      cursor: {
        articles: articleState?.cursor_token ?? null,
        cards: cardState?.cursor_token ?? null,
      },
      watermark: {
        articles: articleState?.watermark_ts ?? null,
        cards: cardState?.watermark_ts ?? null,
      },
      summary: {
        articles: articleCount,
        cards: cardCount,
        total: articleCount + cardCount,
      },
      sample: {
        article: includeArticles ? (articleIndex.items[0] ?? null) : null,
        card: includeCards ? (cardIndex.items[0] ?? null) : null,
      },
      next: [
        'replace fixture reader with WP/EKS fetch adapters',
        'add cursor/watermark persistence in Neon',
        'write transformed output to snapshot repo workspace',
        'commit/push to snapshot repo and trigger KAT /api/sync',
      ],
    }

    await finishRunSuccess({
      runId: runStart.runId,
      sourceKeys: sourceKeysToUpdate,
      articlesCount: result.summary.articles,
      cardsCount: result.summary.cards,
      metadata: {
        dryRun: result.dryRun,
        trigger: result.trigger,
        source: result.source,
      },
    })

    return result
  } catch (error) {
    await finishRunFailed({
      runId: runStart.runId,
      errorText: error instanceof Error ? error.message : String(error),
      metadata: { trigger: input.trigger },
    })
    throw error
  }
}
