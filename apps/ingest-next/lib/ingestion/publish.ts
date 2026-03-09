import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DeterministicDoc } from '@/lib/ingestion/normalize'
import type { ReconciliationPlan } from '@/lib/ingestion/reconcile'

export type PublishMode = 'dry-run' | 'local'

export type PublishResult = {
  mode: PublishMode
  applied: boolean
  outputDir: string | null
  written: number
  deleted: number
  sampleWritten: string[]
  sampleDeleted: string[]
}

function getOutputDir(): string {
  if (process.env.INGEST_OUTPUT_DIR) {
    return process.env.INGEST_OUTPUT_DIR
  }
  if (process.env.VERCEL === '1') {
    return '/tmp/ingest-output'
  }
  return path.join(process.cwd(), '.ingest-output')
}

export async function publishOutput(input: {
  mode: PublishMode
  desiredDocs: DeterministicDoc[]
  plan: ReconciliationPlan
}): Promise<PublishResult> {
  if (input.mode === 'dry-run') {
    return {
      mode: input.mode,
      applied: false,
      outputDir: null,
      written: input.plan.add.length + input.plan.update.length,
      deleted: input.plan.delete.length,
      sampleWritten: [...input.plan.add, ...input.plan.update].slice(0, 5),
      sampleDeleted: input.plan.delete.slice(0, 5),
    }
  }

  const outputDir = getOutputDir()

  for (const doc of input.desiredDocs) {
    const fullPath = path.join(outputDir, doc.path)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, doc.content, 'utf8')
  }

  for (const relativePath of input.plan.delete) {
    const fullPath = path.join(outputDir, relativePath)
    await fs.rm(fullPath, { force: true })
  }

  return {
    mode: input.mode,
    applied: true,
    outputDir,
    written: input.plan.add.length + input.plan.update.length,
    deleted: input.plan.delete.length,
    sampleWritten: [...input.plan.add, ...input.plan.update].slice(0, 5),
    sampleDeleted: input.plan.delete.slice(0, 5),
  }
}
