import articles from '@/fixtures/articles-rag/index.json'
import cards from '@/fixtures/cards-rag/index.json'
import { finishRunFailed, finishRunSuccess, startRun } from '@/lib/ingestion/state'

export type IngestionTrigger = 'manual' | 'cron'

type IndexData = { count: number, items: Array<Record<string, unknown>> }

export type IngestionRunResult = {
  status: 'ok' | 'skipped'
  dryRun: boolean
  runId: string
  runKey: string
  trigger: IngestionTrigger
  mode: 'started' | 'duplicate' | 'locked'
  environment: string
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
  sourceKey?: string
}

export async function runIngestion(input: RunIngestionInput): Promise<IngestionRunResult> {
  const articleIndex = articles as IndexData
  const cardIndex = cards as IndexData
  const sourceKey = input.sourceKey ?? 'all'
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development'
  const runId = crypto.randomUUID()

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
    const result: IngestionRunResult = {
      status: 'ok',
      dryRun: true,
      runId: runStart.runId,
      runKey: input.runKey,
      trigger: input.trigger,
      mode: 'started',
      environment,
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
        'add cursor/watermark persistence in Neon',
        'write transformed output to snapshot repo workspace',
        'commit/push to snapshot repo and trigger KAT /api/sync',
      ],
    }

    await finishRunSuccess({
      runId: runStart.runId,
      sourceKey,
      articlesCount: result.summary.articles,
      cardsCount: result.summary.cards,
      metadata: {
        dryRun: result.dryRun,
        trigger: result.trigger,
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
