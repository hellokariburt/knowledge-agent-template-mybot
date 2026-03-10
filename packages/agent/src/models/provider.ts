import type { LanguageModelV3 } from '@ai-sdk/provider'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGateway } from '@ai-sdk/gateway'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'

export const DIRECT_OPENAI_ROUTER_MODEL = process.env.OPENAI_ROUTER_MODEL || 'openai/gpt-4o-mini'
export const DIRECT_OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL || 'openai/gpt-4o'
export const DIRECT_ANTHROPIC_ROUTER_MODEL = process.env.ANTHROPIC_ROUTER_MODEL || 'anthropic/claude-sonnet-4.6'
export const DIRECT_ANTHROPIC_DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'anthropic/claude-sonnet-4.6'
export const DIRECT_GOOGLE_ROUTER_MODEL = process.env.GOOGLE_ROUTER_MODEL || 'google/gemini-2.5-flash-lite'
export const DIRECT_GOOGLE_DEFAULT_MODEL = process.env.GOOGLE_MODEL || 'google/gemini-3-flash'

export function hasDirectOpenAIKey(): boolean {
  return typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0
}

export function hasDirectAnthropicKey(): boolean {
  return typeof process.env.ANTHROPIC_API_KEY === 'string' && process.env.ANTHROPIC_API_KEY.length > 0
}

export function hasDirectGoogleKey(): boolean {
  return typeof process.env.GOOGLE_GENERATIVE_AI_API_KEY === 'string' && process.env.GOOGLE_GENERATIVE_AI_API_KEY.length > 0
}

export function shouldPreferDirectProviders(): boolean {
  return !process.env.AI_GATEWAY_API_KEY && (hasDirectOpenAIKey() || hasDirectAnthropicKey() || hasDirectGoogleKey())
}

export function getPreferredRouterModel(): string {
  if (hasDirectOpenAIKey()) return DIRECT_OPENAI_ROUTER_MODEL
  if (hasDirectAnthropicKey()) return DIRECT_ANTHROPIC_ROUTER_MODEL
  if (hasDirectGoogleKey()) return DIRECT_GOOGLE_ROUTER_MODEL
  return 'google/gemini-2.5-flash-lite'
}

export function getPreferredDefaultModel(): string {
  if (hasDirectOpenAIKey()) return DIRECT_OPENAI_DEFAULT_MODEL
  if (hasDirectAnthropicKey()) return DIRECT_ANTHROPIC_DEFAULT_MODEL
  if (hasDirectGoogleKey()) return DIRECT_GOOGLE_DEFAULT_MODEL
  return 'google/gemini-3-flash'
}

export function resolveLanguageModel(modelId: string, gatewayApiKey?: string): LanguageModelV3 {
  if (modelId.startsWith('openai/') && hasDirectOpenAIKey()) {
    const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    return openai(modelId.slice('openai/'.length))
  }

  if (modelId.startsWith('anthropic/') && hasDirectAnthropicKey()) {
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    return anthropic(modelId.slice('anthropic/'.length))
  }

  if (modelId.startsWith('google/') && hasDirectGoogleKey()) {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
    return google(modelId.slice('google/'.length))
  }

  // In direct-provider mode, never fall through to AI Gateway for an unsupported
  // provider family. Use the configured direct default model instead.
  if (shouldPreferDirectProviders()) {
    const fallbackModel = getPreferredDefaultModel()
    if (fallbackModel !== modelId) {
      return resolveLanguageModel(fallbackModel)
    }
  }

  const gateway = createGateway(gatewayApiKey ? { apiKey: gatewayApiKey } : undefined)
  return gateway(modelId)
}
