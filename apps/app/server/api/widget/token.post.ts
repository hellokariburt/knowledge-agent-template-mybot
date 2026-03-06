import { z } from 'zod'
import type { CreateWidgetTokenResponse } from '@savoir/sdk'
import { setHeader } from 'h3'
import { createError } from 'evlog'
import {
  enforceAllowedOrigin,
  getRequestOrigin,
  requireWidgetRuntimeConfig,
} from '../../utils/widget/config'
import { createWidgetToken } from '../../utils/widget/token'

const bodySchema = z.object({
  siteId: z.string().min(1),
  visitorId: z.string().min(1),
})

export default defineEventHandler(async (event): Promise<CreateWidgetTokenResponse> => {
  const config = requireWidgetRuntimeConfig(['siteId', 'secret', 'tokenTtlSeconds'])
  const body = await readValidatedBody(event, bodySchema.parse)
  const origin = getRequestOrigin(event)

  enforceAllowedOrigin(event, config.allowedOrigins, origin)
  setHeader(event, 'Cache-Control', 'no-store')

  if (body.siteId !== config.siteId) {
    throw createError({
      statusCode: 400,
      message: 'Invalid siteId',
      data: {
        why: `Received siteId "${body.siteId}" but configured siteId is "${config.siteId}"`,
        fix: 'Use the same siteId value in your widget host app and backend env',
      },
    })
  }

  const token = createWidgetToken({
    siteId: body.siteId,
    visitorId: body.visitorId,
    origin,
    secret: config.secret,
    ttlSeconds: config.tokenTtlSeconds,
  })

  return {
    token,
    expiresInSeconds: config.tokenTtlSeconds,
  }
})
