# Widget Decision Log

Last updated: 2026-02-27

## Decision 1
- Topic: Integration boundary
- Decision: Keep chatbot backend in this app and expose dedicated `/api/widget/*` endpoints for embeddable clients.
- Why: Preserves existing `/api/chats/*` behavior and avoids coupling widget auth to normal user sessions.
- Status: Implemented

## Decision 2
- Topic: Widget authentication
- Decision: Use short-lived HMAC-signed widget tokens minted by `POST /api/widget/token`.
- Why: Browser embed cannot safely use admin API keys directly.
- Status: Implemented
- Notes: Token claims include `siteId`, `origin`, `visitorId`, `iat`, `exp`.

## Decision 3
- Topic: Origin security
- Decision: Enforce allowlisted origins (`NUXT_WIDGET_ALLOWED_ORIGINS`) at token mint and chat endpoints.
- Why: Reduces token abuse from unauthorized domains.
- Status: Implemented

## Decision 4
- Topic: Chat persistence owner
- Decision: Persist widget chats under one configured user (`NUXT_WIDGET_OWNER_USER_ID`).
- Why: Current schema requires `chats.userId`; this avoids immediate DB migration.
- Status: Implemented (interim)
- Risk: All widget chats are grouped under a single owner identity.

## Decision 5
- Topic: Rate limiting identity
- Decision: Rate limit widget traffic by `widget:<siteId>:<visitorId>`.
- Why: Maintains a per-visitor limit without requiring a local auth session.
- Status: Implemented

## Decision 6
- Topic: SDK surface area
- Decision: Extend `@savoir/sdk` with widget methods (`getWidgetConfig`, `createWidgetToken`, `streamWidgetChat`).
- Why: Gives Next.js frontend a stable typed contract.
- Status: Implemented

## Decision 7
- Topic: Sandbox session isolation
- Decision: Do not reuse sandbox sessions in widget endpoint yet.
- Why: Avoid cross-visitor context leakage in first version.
- Status: Implemented
- Tradeoff: Higher per-request sandbox overhead.

## Decision 8
- Topic: Cross-origin browser support
- Decision: Add explicit CORS handling and `OPTIONS` preflight routes for `/api/widget/*`.
- Why: Widget requests originate from external host apps (e.g. Next.js domain).
- Status: Implemented

## Next decisions pending
- Dedicated widget conversation table and tenant model (replace single owner user pattern).
- Host-side token minting strategy for production (server-to-server preferred).
- Widget event schema/versioning for FE analytics hooks.
