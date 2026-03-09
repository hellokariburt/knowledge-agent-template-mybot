import type { DeterministicDoc } from '@/lib/ingestion/normalize'

export type ManifestEntry = {
  sourceKey: 'articles' | 'cards'
  filePath: string
  contentHash: string
}

export type ReconciliationPlan = {
  add: string[]
  update: string[]
  delete: string[]
}

export function buildReconciliationPlan(input: {
  desiredDocs: DeterministicDoc[]
  existingEntries: ManifestEntry[]
  includeDeletes: boolean
}): ReconciliationPlan {
  const desiredByPath = new Map(input.desiredDocs.map((doc) => [doc.path, doc]))
  const existingByPath = new Map(input.existingEntries.map((entry) => [entry.filePath, entry]))

  const add: string[] = []
  const update: string[] = []
  const del: string[] = []

  for (const [path, desired] of desiredByPath.entries()) {
    const existing = existingByPath.get(path)
    if (!existing) {
      add.push(path)
      continue
    }
    if (existing.contentHash !== desired.contentHash) {
      update.push(path)
    }
  }

  if (input.includeDeletes) {
    for (const path of existingByPath.keys()) {
      if (!desiredByPath.has(path)) {
        del.push(path)
      }
    }
  }

  return {
    add: add.sort(),
    update: update.sort(),
    delete: del.sort(),
  }
}
