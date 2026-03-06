# Widget Mock Next App

Standalone Next.js mock host to test the KAT widget APIs with a TPG-style layout.

## 1) Create a Next app

```bash
npx create-next-app@latest widget-mock-next --ts --app
cd widget-mock-next
bun add @savoir/sdk
```

## 2) Copy files

Copy the files from this folder into your Next app:

- `app/layout.tsx`
- `app/globals.css`
- `app/page.tsx`
- `app/api/chat-widget/token/route.ts`

## 3) Env vars (`.env.local`)

```bash
CHATBOT_BASE_URL=https://knowledge-agent-template-mybot-app.vercel.app
CHATBOT_WIDGET_SITE_ID=thepointsguy-web
NEXT_PUBLIC_CHATBOT_BASE_URL=https://knowledge-agent-template-mybot-app.vercel.app
```

## 4) Run

```bash
bun run dev
```
