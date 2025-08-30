"use client"

import type React from "react"

interface ModuleWrapperProps {
  moduleId: string
  children: React.ReactNode
}

export function ModuleWrapper({ moduleId, children }: ModuleWrapperProps) {
  return <div className="relative h-full">{children}</div>
}
