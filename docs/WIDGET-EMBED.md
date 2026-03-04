# Widget Embed Quickstart (Next.js)

## Backend env (this project)

Set the following values in `apps/app` deployment:

- `NUXT_WIDGET_SITE_ID`
- `NUXT_WIDGET_SECRET`
- `NUXT_WIDGET_OWNER_USER_ID`
- `NUXT_WIDGET_ALLOWED_ORIGINS`
- `NUXT_WIDGET_DEFAULT_MODEL` (optional)

## Next.js server route (token mint)

Use your server to mint tokens and avoid exposing secrets in the browser.

```ts
// app/api/chat-widget/token/route.ts
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const { visitorId } = await req.json()

  const res = await fetch(`${process.env.CHATBOT_BASE_URL}/api/widget/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      siteId: process.env.CHATBOT_WIDGET_SITE_ID,
      visitorId,
    }),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
```

## Frontend usage with `@savoir/sdk`

```ts
import { createSavoir } from '@savoir/sdk'

const savoir = createSavoir({ apiUrl: process.env.NEXT_PUBLIC_CHATBOT_BASE_URL! })

const config = await savoir.getWidgetConfig()
const tokenRes = await fetch('/api/chat-widget/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ visitorId: 'visitor-123' }),
}).then(r => r.json())

const stream = await savoir.streamWidgetChat({
  token: tokenRes.token,
  chatId: undefined,
  model: config.defaultModel,
  messages: [
    { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
  ],
})

// Parse SSE stream in your widget UI
```
