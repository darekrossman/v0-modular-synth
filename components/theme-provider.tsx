"use client"

import type * as React from "react"
import type { ThemeProvider as NextThemesProvider } from "next-themes"

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return <div className="dark">{children}</div>
}
