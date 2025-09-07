import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import type React from 'react'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'

const geist = GeistSans

export const metadata: Metadata = {
  title: 'rack0 [alpha]',
  description: 'eurorack-inspired modular synthesis environment',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${geist.variable} antialiased dark`}>
      <head>
        <style>{`
html {
  font-family: ${GeistMono.style.fontFamily};
  --font-sans: ${geist.variable};
  --font-mono: ${GeistMono.variable};
}
        `}</style>
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
