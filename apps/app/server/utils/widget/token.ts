import { createHmac, timingSafeEqual } from 'node:crypto'
import { createError } from 'evlog'

interface WidgetTokenClaims {
  siteId: string
  visitorId: string
  origin: string | null
  iat: number
  exp: number
}

const TOKEN_HEADER = {
  alg: 'HS256',
  typ: 'JWT',
} as const

function toBase64Url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function signSegment(secret: string, headerPart: string, payloadPart: string): string {
  return createHmac('sha256', secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url')
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return timingSafeEqual(aBuf, bBuf)
}

export function createWidgetToken(input: {
  siteId: string
  visitorId: string
  origin: string | null
  secret: string
  ttlSeconds: number
}): string {
  const now = Math.floor(Date.now() / 1000)
  const claims: WidgetTokenClaims = {
    siteId: input.siteId,
    visitorId: input.visitorId,
    origin: input.origin,
    iat: now,
    exp: now + input.ttlSeconds,
  }

  const headerPart = toBase64Url(JSON.stringify(TOKEN_HEADER))
  const payloadPart = toBase64Url(JSON.stringify(claims))
  const sigPart = signSegment(input.secret, headerPart, payloadPart)

  return `${headerPart}.${payloadPart}.${sigPart}`
}

export function verifyWidgetToken(token: string, secret: string): WidgetTokenClaims {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw createError({ statusCode: 401, message: 'Invalid widget token format' })
  }

  const [headerPart, payloadPart, sigPart] = parts
  const expectedSig = signSegment(secret, headerPart!, payloadPart!)
  if (!safeCompare(expectedSig, sigPart!)) {
    throw createError({ statusCode: 401, message: 'Invalid widget token signature' })
  }

  let payload: WidgetTokenClaims
  try {
    payload = JSON.parse(fromBase64Url(payloadPart!)) as WidgetTokenClaims
  } catch {
    throw createError({ statusCode: 401, message: 'Invalid widget token payload' })
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp <= now) {
    throw createError({ statusCode: 401, message: 'Widget token expired' })
  }

  if (!payload.siteId || !payload.visitorId) {
    throw createError({ statusCode: 401, message: 'Widget token missing required claims' })
  }

  return payload
}
