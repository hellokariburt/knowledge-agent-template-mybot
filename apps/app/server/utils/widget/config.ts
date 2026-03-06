import { createError } from 'evlog'
import { getHeader, setHeader } from 'h3'

export interface WidgetRuntimeConfig {
  siteId: string
  secret: string
  ownerUserId: string
  allowedOrigins: string[]
  defaultModel: string
  name: string
  welcomeMessage: string
  tokenTtlSeconds: number
  rateLimitPerMinute: number
}

function splitOrigins(input: string | undefined): string[] {
  if (!input) return []
  return input
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
}

export function getWidgetRuntimeConfig(): WidgetRuntimeConfig {
  const runtimeConfig = useRuntimeConfig()
  const widget = runtimeConfig.widget ?? {}

  return {
    siteId: String(widget.siteId ?? ''),
    secret: String(widget.secret ?? ''),
    ownerUserId: String(widget.ownerUserId ?? ''),
    allowedOrigins: splitOrigins(String(widget.allowedOrigins ?? '')),
    defaultModel: String(widget.defaultModel ?? 'google/gemini-3-flash'),
    name: String(widget.name ?? 'TPG Assistant'),
    welcomeMessage: String(widget.welcomeMessage ?? 'Hi, I can help with points, cards, and travel strategy.'),
    tokenTtlSeconds: Number(widget.tokenTtlSeconds ?? 600),
    rateLimitPerMinute: Number(widget.rateLimitPerMinute ?? 20),
  }
}

export function requireWidgetRuntimeConfig(required: Array<keyof WidgetRuntimeConfig>): WidgetRuntimeConfig {
  const config = getWidgetRuntimeConfig()

  for (const key of required) {
    const value = config[key]
    if (
      value === ''
      || value === null
      || value === undefined
      || (Array.isArray(value) && value.length === 0)
    ) {
      throw createError({
        statusCode: 500,
        message: `Missing widget configuration: ${String(key)}`,
        data: {
          why: `Widget endpoint requires "${String(key)}" to be configured`,
          fix: `Set NUXT_WIDGET_${String(key).replace(/[A-Z]/g, m => `_${m}`).toUpperCase()} in deployment environment variables`,
        },
      })
    }
  }

  return config
}

export function getRequestOrigin(event: Parameters<typeof getHeader>[0]): string | null {
  return getHeader(event, 'origin') ?? null
}

export function isAllowedOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false
  if (allowedOrigins.includes('*')) return true
  return allowedOrigins.includes(origin)
}

export function setCorsHeaders(event: Parameters<typeof setHeader>[0], origin: string): void {
  setHeader(event, 'Access-Control-Allow-Origin', origin)
  setHeader(event, 'Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  setHeader(event, 'Access-Control-Allow-Headers', 'Content-Type,Authorization')
  setHeader(event, 'Access-Control-Max-Age', '600')
  setHeader(event, 'Vary', 'Origin')
}

export function enforceAllowedOrigin(
  event: Parameters<typeof getHeader>[0],
  allowedOrigins: string[],
  origin: string | null,
): void {
  if (!origin) return

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    throw createError({
      statusCode: 403,
      message: 'Origin not allowed',
      data: {
        why: `Origin "${origin}" is not in the widget allowlist`,
        fix: 'Add this origin to NUXT_WIDGET_ALLOWED_ORIGINS (comma-separated)',
      },
    })
  }

  setCorsHeaders(event, origin)
}
