'use client'

import type React from 'react'
import { createContext, useContext, useMemo, useState } from 'react'

type SettingsState = Record<string, unknown>

interface SettingsContextValue {
  settings: SettingsState
  setSettings: React.Dispatch<React.SetStateAction<SettingsState>>
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>({
    wireTension: 0.75,
    wireOpacity: 0.8,
    wireThickness: 5,
  })
  const [isOpen, setIsOpen] = useState(false)

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      setSettings,
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
    }),
    [settings, isOpen],
  )

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx)
    throw new Error('useSettings must be used within a SettingsProvider')
  return ctx
}
