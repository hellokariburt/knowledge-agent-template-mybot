import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TPG Widget Mock',
  description: 'Mock host page for KAT widget testing',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
