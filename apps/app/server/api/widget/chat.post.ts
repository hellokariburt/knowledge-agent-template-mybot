import { and, eq } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { kv } from '@nuxthub/kv'
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai'
import { createError, useLogger } from 'evlog'
import { setHeader } from 'h3'
import { createSourceAgent } from '@savoir/agent'
import { z } from 'zod'
import { createInternalSavoir } from '../../utils/bot/savoir'
import { getAgentConfig } from '../../utils/agent-config'
import {
  enforceAllowedOrigin,
  getRequestOrigin,
  requireWidgetRuntimeConfig,
} from '../../utils/widget/config'
import { verifyWidgetToken } from '../../utils/widget/token'

const bodySchema = z.object({
  token: z.string().min(1),
  messages: z.array(z.custom<UIMessage>()).min(1),
  chatId: z.string().optional(),
  model: z.string().optional(),
})

const inMemoryWidgetRateLimit = new Map<string, { count: number, expiresAt: number }>()

function sanitizeKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function widgetRateLimitKey(siteId: string, visitorId: string, minute: string): string {
  const safeSiteId = sanitizeKeyPart(siteId)
  const safeVisitorId = sanitizeKeyPart(visitorId)
  const safeMinute = sanitizeKeyPart(minute)
  return `ratelimit_widget_${safeSiteId}_${safeVisitorId}_${safeMinute}`
}

function currentMinuteKey(): string {
  return new Date().toISOString().slice(0, 16)
}

async function checkAndIncrementWidgetRateLimit(
  key: string,
  limit: number,
): Promise<{ limited: boolean, count: number }> {
  const now = Date.now()
  const ttlMs = 90_000

  try {
    const currentCount = await kv.get<number>(key) ?? 0
    if (currentCount >= limit) {
      return { limited: true, count: currentCount }
    }
    await kv.set(key, currentCount + 1, { ttl: 90 })
    return { limited: false, count: currentCount + 1 }
  } catch {
    const existing = inMemoryWidgetRateLimit.get(key)
    const count = existing && existing.expiresAt > now ? existing.count : 0

    if (count >= limit) {
      return { limited: true, count }
    }

    inMemoryWidgetRateLimit.set(key, {
      count: count + 1,
      expiresAt: now + ttlMs,
    })

    return { limited: false, count: count + 1 }
  }
}

export default defineEventHandler(async (event) => {
  const requestLog = useLogger(event)
  const config = requireWidgetRuntimeConfig([
    'siteId',
    'secret',
    'ownerUserId',
    'defaultModel',
    'rateLimitPerMinute',
  ])

  const origin = getRequestOrigin(event)
  enforceAllowedOrigin(event, config.allowedOrigins, origin)
  setHeader(event, 'Cache-Control', 'no-store')

  const body = await readValidatedBody(event, bodySchema.parse)
  const claims = verifyWidgetToken(body.token, config.secret)

  if (claims.siteId !== config.siteId) {
    throw createError({
      statusCode: 401,
      message: 'Token siteId mismatch',
    })
  }

  if (claims.origin && origin && claims.origin !== origin) {
    throw createError({
      statusCode: 403,
      message: 'Token origin mismatch',
      data: {
        why: `Token was minted for origin "${claims.origin}" but request origin is "${origin}"`,
        fix: 'Mint a token from the same origin where the widget runs',
      },
    })
  }

  const minute = currentMinuteKey()
  const rateLimitKey = widgetRateLimitKey(claims.siteId, claims.visitorId, minute)
  const rateLimit = await checkAndIncrementWidgetRateLimit(rateLimitKey, config.rateLimitPerMinute)
  if (rateLimit.limited) {
    throw createError({
      statusCode: 429,
      message: 'Widget rate limit exceeded',
      data: {
        why: `Exceeded ${config.rateLimitPerMinute} requests in the current minute`,
        fix: 'Retry shortly or lower request frequency from the widget host',
      },
    })
  }

  const owner = await db.query.user.findFirst({
    where: () => eq(schema.user.id, config.ownerUserId),
    columns: { id: true },
  })
  if (!owner) {
    throw createError({
      statusCode: 400,
      message: 'Invalid widget owner user',
      data: {
        why: `No user found for NUXT_WIDGET_OWNER_USER_ID="${config.ownerUserId}"`,
        fix: 'Set NUXT_WIDGET_OWNER_USER_ID to an existing user id in this deployment',
      },
    })
  }

  const latestUserMessage = [...body.messages].reverse().find(message => message.role === 'user')
  if (!latestUserMessage) {
    throw createError({ statusCode: 400, message: 'Widget request requires at least one user message' })
  }

  const effectiveModel = body.model || config.defaultModel
  const requestId = crypto.randomUUID().slice(0, 8)

  const { chatId: requestedChatId } = body
  let chatId = requestedChatId
  if (chatId) {
    const existingChat = await db.query.chats.findFirst({
      where: () => and(
        eq(schema.chats.id, chatId as string),
        eq(schema.chats.userId, owner.id),
      ),
      columns: { id: true },
    })
    if (!existingChat) {
      throw createError({ statusCode: 404, message: 'Widget chat not found' })
    }
  } else {
    const [createdChat] = await db.insert(schema.chats).values({
      title: '',
      mode: 'chat',
      userId: owner.id,
    }).returning({ id: schema.chats.id })

    if (!createdChat) {
      throw createError({ statusCode: 500, message: 'Failed to create widget chat' })
    }

    const { id: newChatId } = createdChat
    chatId = newChatId
  }

  setHeader(event, 'X-Chat-Id', chatId)

  await db.insert(schema.messages).values({
    id: latestUserMessage.id,
    chatId,
    role: 'user',
    parts: latestUserMessage.parts,
    source: 'api',
  })

  requestLog.set({
    requestId,
    path: '/api/widget/chat',
    siteId: claims.siteId,
    visitorId: claims.visitorId,
    chatId,
    messageCount: body.messages.length,
    model: effectiveModel,
  })

  const internalSavoir = createInternalSavoir({
    source: 'widget',
    sourceId: `${claims.siteId}:${claims.visitorId}`,
  })

  const agent = createSourceAgent({
    tools: internalSavoir.tools,
    getAgentConfig,
    messages: body.messages,
    defaultModel: effectiveModel,
    requestId,
  })

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await agent.stream({
        messages: await convertToModelMessages(body.messages),
        options: {},
      })

      writer.merge(result.toUIMessageStream())
    },
    onFinish: async ({ messages }) => {
      const assistantMessages = messages.filter(message => message.role === 'assistant')
      if (assistantMessages.length === 0) return

      await db.insert(schema.messages).values(
        assistantMessages.map(message => ({
          id: message.id,
          chatId,
          role: 'assistant' as const,
          parts: message.parts,
          model: effectiveModel,
          source: 'api' as const,
        })),
      )
    },
  })

  return createUIMessageStreamResponse({ stream })
})
