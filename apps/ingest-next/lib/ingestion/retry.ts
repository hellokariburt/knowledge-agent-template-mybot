export async function withRetry<T>(input: {
  attempts: number
  initialDelayMs: number
  factor: number
  operation: () => Promise<T>
}): Promise<T> {
  let lastError: unknown
  let delayMs = input.initialDelayMs

  for (let attempt = 1; attempt <= input.attempts; attempt++) {
    try {
      return await input.operation()
    } catch (error) {
      lastError = error
      if (attempt === input.attempts) break
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      delayMs = Math.floor(delayMs * input.factor)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
