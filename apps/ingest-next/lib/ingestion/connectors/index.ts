import { MockConnector } from '@/lib/ingestion/connectors/mock'
import type { IngestionConnector } from '@/lib/ingestion/connectors/types'

export function getConnector(): IngestionConnector {
  const connectorType = process.env.INGEST_CONNECTOR ?? 'mock'

  if (connectorType === 'mock') {
    return new MockConnector()
  }

  throw new Error(`Unsupported INGEST_CONNECTOR value: ${connectorType}`)
}
