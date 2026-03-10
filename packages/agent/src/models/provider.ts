import { createGateway } from '@ai-sdk/gateway'
import { createOpenAI } from '@ai-sdk/openai'

export function hasDirectOpenAIKey(): boolean {
  return typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0
}

export function shouldPreferDirectOpenAI(): boolean {
  return hasDirectOpenAIKey() && !process.env.AI_GATEWAY_API_KEY
}

export function resolveLanguageModel(modelId: string, gatewayApiKey?: string) {
  if (modelId.startsWith('openai/') && hasDirectOpenAIKey()) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai(modelId.slice('openai/'.length))
  }

  const gateway = createGateway(gatewayApiKey ? { apiKey: gatewayApiKey } : undefined)
  return gateway(modelId)
}
