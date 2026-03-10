import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { DeterministicDoc } from '@/lib/ingestion/normalize'
import type { ReconciliationPlan } from '@/lib/ingestion/reconcile'

export type PublishMode = 'dry-run' | 'local' | 'git'

export type PublishResult = {
  mode: PublishMode
  applied: boolean
  outputDir: string | null
  written: number
  deleted: number
  sampleWritten: string[]
  sampleDeleted: string[]
}

const execFileAsync = promisify(execFile)
const DEFAULT_GIT_USER_NAME = 'Ingestion Bot'
const DEFAULT_GIT_USER_EMAIL = 'ingestion-bot@example.com'

function getOutputDir(): string {
  if (process.env.INGEST_OUTPUT_DIR) {
    return process.env.INGEST_OUTPUT_DIR
  }
  if (process.env.VERCEL === '1') {
    return '/tmp/ingest-output'
  }
  return path.join(process.cwd(), '.ingest-output')
}

function getGitPublishConfig() {
  return {
    repoUrl: process.env.SNAPSHOT_REPO_URL,
    branch: process.env.SNAPSHOT_REPO_BRANCH ?? 'main',
    token: process.env.SNAPSHOT_REPO_TOKEN,
    userName: process.env.SNAPSHOT_GIT_USER_NAME ?? DEFAULT_GIT_USER_NAME,
    userEmail: process.env.SNAPSHOT_GIT_USER_EMAIL ?? DEFAULT_GIT_USER_EMAIL,
    keepWorkdir: process.env.INGEST_KEEP_GIT_WORKDIR === 'true',
  }
}

async function cloneSnapshotRepo(input: {
  repoUrl: string
  token: string
  branch: string
  workdir: string
}): Promise<void> {
  const authUrl = input.repoUrl.replace('https://', `https://x-access-token:${input.token}@`)

  try {
    await execFileAsync('git', ['clone', '--depth', '1', '--branch', input.branch, authUrl, input.workdir])
  } catch {
    await execFileAsync('git', ['clone', '--depth', '1', authUrl, input.workdir])
    await execFileAsync('git', ['checkout', '-b', input.branch], { cwd: input.workdir })
  }
}

async function configureGitIdentity(workdir: string, input: {
  userName: string
  userEmail: string
}): Promise<void> {
  await execFileAsync('git', ['config', 'user.name', input.userName], { cwd: workdir })
  await execFileAsync('git', ['config', 'user.email', input.userEmail], { cwd: workdir })
}

export async function publishOutput(input: {
  mode: PublishMode
  desiredDocs: DeterministicDoc[]
  plan: ReconciliationPlan
  runId: string
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

  if (input.mode === 'local') {
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

  const { repoUrl, branch, token, userName, userEmail, keepWorkdir } = getGitPublishConfig()
  if (!repoUrl || !token) {
    throw new Error('Missing SNAPSHOT_REPO_URL or SNAPSHOT_REPO_TOKEN for publishMode=git')
  }
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'ingest-git-'))
  let publishedOutputDir: string | null = workdir

  try {
    await cloneSnapshotRepo({
      repoUrl,
      token,
      branch,
      workdir,
    })
    await configureGitIdentity(workdir, { userName, userEmail })

    for (const doc of input.desiredDocs) {
      const fullPath = path.join(workdir, doc.path)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, doc.content, 'utf8')
    }

    for (const relativePath of input.plan.delete) {
      const fullPath = path.join(workdir, relativePath)
      await fs.rm(fullPath, { force: true })
    }

    await execFileAsync('git', ['add', '-A'], { cwd: workdir })
    const status = await execFileAsync('git', ['status', '--porcelain'], { cwd: workdir })

    if (status.stdout.trim().length > 0) {
      await execFileAsync('git', ['commit', '-m', `ingest: run ${input.runId}`], { cwd: workdir })
      await execFileAsync('git', ['push', '--set-upstream', 'origin', branch], { cwd: workdir })
    }
  } finally {
    if (!keepWorkdir) {
      await fs.rm(workdir, { recursive: true, force: true })
      publishedOutputDir = null
    }
  }

  return {
    mode: input.mode,
    applied: true,
    outputDir: publishedOutputDir,
    written: input.plan.add.length + input.plan.update.length,
    deleted: input.plan.delete.length,
    sampleWritten: [...input.plan.add, ...input.plan.update].slice(0, 5),
    sampleDeleted: input.plan.delete.slice(0, 5),
  }
}
