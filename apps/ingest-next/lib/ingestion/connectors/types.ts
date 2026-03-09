import type { IngestionSource } from '@/lib/ingestion/run'

export type IngestionRecord = Record<string, unknown>

export type ConnectorFetchInput = {
  source: Exclude<IngestionSource, 'all'>
  watermarkTs: string | null
  cursorToken: string | null
}

export type ConnectorFetchOutput = {
  items: IngestionRecord[]
  nextCursorToken: string | null
  maxUpdatedAt: string | null
}

export interface IngestionConnector {
  name: string
  fetchPage(input: ConnectorFetchInput): Promise<ConnectorFetchOutput>
}
