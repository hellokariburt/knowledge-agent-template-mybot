import type { WidgetConfigResponse } from '@savoir/sdk'
import { getRequestOrigin, getWidgetRuntimeConfig, setCorsHeaders } from '../../utils/widget/config'

export default defineEventHandler((event): WidgetConfigResponse => {
  const config = getWidgetRuntimeConfig()
  const origin = getRequestOrigin(event)
  if (origin) {
    setCorsHeaders(event, origin)
  }

  return {
    siteId: config.siteId,
    tokenEndpoint: '/api/widget/token',
    chatEndpoint: '/api/widget/chat',
    defaultModel: config.defaultModel,
    name: config.name,
    welcomeMessage: config.welcomeMessage,
  }
})
