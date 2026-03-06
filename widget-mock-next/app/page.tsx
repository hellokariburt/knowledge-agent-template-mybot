'use client'

import { createSavoir } from '@savoir/sdk'
import { useMemo, useState } from 'react'

export default function Page() {
  const [visitorId, setVisitorId] = useState('demo-visitor-1')
  const [prompt, setPrompt] = useState('What is the best strategy for earning points on dining?')
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle')
  const [error, setError] = useState('')

  const savoir = useMemo(
    () => createSavoir({ apiUrl: process.env.NEXT_PUBLIC_CHATBOT_BASE_URL! }),
    [],
  )

  async function runWidgetChat() {
    setStatus('running')
    setError('')
    setOutput('')

    try {
      const tokenResponse = await fetch('/api/chat-widget/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId }),
      })

      if (!tokenResponse.ok) {
        const data = await tokenResponse.json().catch(() => ({}))
        throw new Error(data?.message || `Token request failed (${tokenResponse.status})`)
      }

      const tokenData = await tokenResponse.json() as { token: string }
      const config = await savoir.getWidgetConfig()
      const response = await savoir.streamWidgetChat({
        token: tokenData.token,
        model: config.defaultModel,
        messages: [
          { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: prompt }] },
        ],
      })

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '')
        throw new Error(errText || `Chat request failed (${response.status})`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setOutput(accumulated)
      }

      setStatus('idle')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="shell">
      <section className="masthead">
        <span className="badge">TPG-Style Widget Mock</span>
        <h1>Points and Cards Assistant</h1>
        <p>
          This page simulates a branded host experience for your embeddable KAT chatbot.
          It mints widget tokens server-side, then streams chat from your deployed backend.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <div className="label">Widget Console</div>
          <div className="chat-log">{output || 'No response yet. Send a question to start a stream.'}</div>
          <div className="controls">
            <input
              value={visitorId}
              onChange={e => setVisitorId(e.target.value)}
              placeholder="visitor id"
            />
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Ask about points, cards, lounge access..."
            />
            <button
              className="btn primary"
              onClick={runWidgetChat}
              disabled={status === 'running'}
            >
              {status === 'running' ? 'Streaming...' : 'Send Question'}
            </button>
            {error && <div className="tip">Error: {error}</div>}
          </div>
        </article>

        <aside className="card">
          <div className="label">Smoke Test Checklist</div>
          <p className="tip">1. Token route returns a token</p>
          <p className="tip">2. Widget config endpoint responds</p>
          <p className="tip">3. Chat stream emits SSE chunks</p>
          <p className="tip">4. Response references mock snapshot content</p>
        </aside>
      </section>
    </main>
  )
}
