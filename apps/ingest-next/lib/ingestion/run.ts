import { getConnector } from '@/lib/ingestion/connectors'
import type { IngestionRecord } from '@/lib/ingestion/connectors/types'
import { normalizeArticle, normalizeCard } from '@/lib/ingestion/normalize'
import { buildReconciliationPlan } from '@/lib/ingestion/reconcile'
import { applySnapshotManifestForSource, finishRunFailed, finishRunSuccess, getSnapshotManifestBySources, getSyncState, startRun } from '@/lib/ingestion/state'

export type IngestionTrigger = 'manual' | 'cron'
export type IngestionSource = 'all' | 'articles' | 'cards'

export type IngestionRunResult = {
  status: 'ok' | 'skipped'
  dryRun: boolean
  applied: boolean
  runId: string
  runKey: string
  trigger: IngestionTrigger
  mode: 'started' | 'duplicate' | 'locked'
  environment: string
  source: IngestionSource
  connector: string
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
  reconciliation: {
    add: number
    update: number
    delete: number
    samplePaths: {
      add: string[]
      update: string[]
      delete: string[]
    }
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
  dryRun: boolean
}

type SourceResult = {
  items: IngestionRecord[]
  finalCursorToken: string | null
  maxUpdatedAt: string | null
}

function maxTimestamp(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left
  return Date.parse(left) >= Date.parse(right) ? left : right
}

async function fetchAllForSource(input: {
  source: 'articles' | 'cards'
  watermarkTs: string | null
  cursorToken: string | null
}): Promise<SourceResult> {
  const connector = getConnector()
  const items: IngestionRecord[] = []
  let cursorToken = input.cursorToken
  let maxUpdatedAt: string | null = null

  while (true) {
    const page = await connector.fetchPage({
      source: input.source,
      watermarkTs: input.watermarkTs,
      cursorToken,
    })

    items.push(...page.items)
    maxUpdatedAt = maxTimestamp(maxUpdatedAt, page.maxUpdatedAt)
    cursorToken = page.nextCursorToken

    if (!cursorToken) break
  }

  return {
    items,
    finalCursorToken: null,
    maxUpdatedAt: maxTimestamp(input.watermarkTs, maxUpdatedAt),
  }
}

export async function runIngestion(input: RunIngestionInput): Promise<IngestionRunResult> {
  const sourceKey = input.source
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development'
  const runId = crypto.randomUUID()
  const connector = getConnector()

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
      dryRun: input.dryRun,
      applied: false,
      runId,
      runKey: input.runKey,
      trigger: input.trigger,
      mode: 'locked',
      environment,
      source: input.source,
      connector: connector.name,
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
      reconciliation: {
        add: 0,
        update: 0,
        delete: 0,
        samplePaths: {
          add: [],
          update: [],
          delete: [],
        },
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
      dryRun: input.dryRun,
      applied: false,
      runId: runStart.runId,
      runKey: input.runKey,
      trigger: input.trigger,
      mode: 'duplicate',
      environment,
      source: input.source,
      connector: connector.name,
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
      reconciliation: {
        add: 0,
        update: 0,
        delete: 0,
        samplePaths: {
          add: [],
          update: [],
          delete: [],
        },
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

    const articleFetch = includeArticles
      ? await fetchAllForSource({
        source: 'articles',
        watermarkTs: articleState?.watermark_ts ?? null,
        cursorToken: articleState?.cursor_token ?? null,
      })
      : { items: [], finalCursorToken: articleState?.cursor_token ?? null, maxUpdatedAt: articleState?.watermark_ts ?? null }

    const cardFetch = includeCards
      ? await fetchAllForSource({
        source: 'cards',
        watermarkTs: cardState?.watermark_ts ?? null,
        cursorToken: cardState?.cursor_token ?? null,
      })
      : { items: [], finalCursorToken: cardState?.cursor_token ?? null, maxUpdatedAt: cardState?.watermark_ts ?? null }

    const desiredDocs = [
      ...articleFetch.items.map(normalizeArticle),
      ...cardFetch.items.map(normalizeCard),
    ]
    const manifest = await getSnapshotManifestBySources(
      [
        ...(includeArticles ? (['articles'] as const) : []),
        ...(includeCards ? (['cards'] as const) : []),
      ],
    )
    const plan = buildReconciliationPlan({
      desiredDocs,
      existingEntries: manifest.map((entry) => ({
        sourceKey: entry.source_key as 'articles' | 'cards',
        filePath: entry.file_path,
        contentHash: entry.content_hash,
      })),
    })

    const result: IngestionRunResult = {
      status: 'ok',
      dryRun: input.dryRun,
      applied: false,
      runId: runStart.runId,
      runKey: input.runKey,
      trigger: input.trigger,
      mode: 'started',
      environment,
      source: input.source,
      connector: connector.name,
      cursor: {
        articles: articleFetch.finalCursorToken,
        cards: cardFetch.finalCursorToken,
      },
      watermark: {
        articles: articleFetch.maxUpdatedAt,
        cards: cardFetch.maxUpdatedAt,
      },
      summary: {
        articles: articleFetch.items.length,
        cards: cardFetch.items.length,
        total: articleFetch.items.length + cardFetch.items.length,
      },
      reconciliation: {
        add: plan.add.length,
        update: plan.update.length,
        delete: plan.delete.length,
        samplePaths: {
          add: plan.add.slice(0, 5),
          update: plan.update.slice(0, 5),
          delete: plan.delete.slice(0, 5),
        },
      },
      sample: {
        article: articleFetch.items[0] ?? null,
        card: cardFetch.items[0] ?? null,
      },
      next: [
        'replace mock connector with WP/EKS fetch adapters',
        'write deterministic docs/articles and docs/cards to workspace',
        'publish reconciliation to snapshot repo (add/update/delete)',
        'trigger KAT /api/sync after successful publish',
      ],
    }

    const sourceUpdates: Array<{ sourceKey: string, cursorToken: string | null, watermarkTs: string | null }> = []
    if (includeArticles) {
      sourceUpdates.push({
        sourceKey: 'articles',
        cursorToken: result.cursor.articles,
        watermarkTs: result.watermark.articles,
      })
    }
    if (includeCards) {
      sourceUpdates.push({
        sourceKey: 'cards',
        cursorToken: result.cursor.cards,
        watermarkTs: result.watermark.cards,
      })
    }

    if (!input.dryRun) {
      if (includeArticles) {
        await applySnapshotManifestForSource({
          sourceKey: 'articles',
          desiredEntries: desiredDocs
            .filter((doc) => doc.sourceKey === 'articles')
            .map((doc) => ({ filePath: doc.path, contentHash: doc.contentHash })),
        })
      }

      if (includeCards) {
        await applySnapshotManifestForSource({
          sourceKey: 'cards',
          desiredEntries: desiredDocs
            .filter((doc) => doc.sourceKey === 'cards')
            .map((doc) => ({ filePath: doc.path, contentHash: doc.contentHash })),
        })
      }

      result.applied = true
    }

    await finishRunSuccess({
      runId: runStart.runId,
      sourceUpdates,
      articlesCount: result.summary.articles,
      cardsCount: result.summary.cards,
      metadata: {
        dryRun: result.dryRun,
        trigger: result.trigger,
        source: result.source,
        connector: result.connector,
        reconciliation: result.reconciliation,
      },
    })

    return result
  } catch (error) {
    await finishRunFailed({
      runId: runStart.runId,
      errorText: error instanceof Error ? error.message : String(error),
      metadata: { trigger: input.trigger, source: input.source },
    })
    throw error
  }
}
