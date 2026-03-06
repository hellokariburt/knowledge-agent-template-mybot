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
