import { setResponseStatus } from 'h3'
import { enforceAllowedOrigin, getRequestOrigin, getWidgetRuntimeConfig } from '../../utils/widget/config'

export default defineEventHandler((event) => {
  const config = getWidgetRuntimeConfig()
  const origin = getRequestOrigin(event)
  enforceAllowedOrigin(event, config.allowedOrigins, origin)
  setResponseStatus(event, 204)
  return ''
})
