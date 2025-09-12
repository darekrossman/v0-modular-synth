'use client'

import type { MutableRefObject, ReactNode } from 'react'
import * as React from 'react'
import { LayoutEngine } from '@/lib/layout/engine'

export type LayoutContextValue = {
  engineRef: MutableRefObject<LayoutEngine | null>
  registerViewport: (el: HTMLDivElement | null) => void
  registerWorld: (el: HTMLDivElement | null) => void
  getScale: () => number
  setScaleRef: (get: () => number) => void
  getRackRect: (rackIndex: number) => DOMRect | null
  setGetRackRect: (get: (rackIndex: number) => DOMRect | null) => void
  beginGeometryRefresh: () => void
  endGeometryRefresh: () => void
  scheduleWireRefresh: () => void
}

const LayoutContext = React.createContext<LayoutContextValue | null>(null)

export function useLayout() {
  const ctx = React.useContext(LayoutContext)
  if (!ctx) throw new Error('LayoutContext not available')
  return ctx
}

export function LayoutProvider({
  children,
  rowHeightPx,
  numRows,
}: {
  children: ReactNode
  rowHeightPx: number
  numRows: number
}) {
  const engineRef = React.useRef<LayoutEngine | null>(null)
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const worldRef = React.useRef<HTMLDivElement | null>(null)
  const getScaleRef = React.useRef<() => number>(() => 1)
  const getRackRectRef = React.useRef<(rackIndex: number) => DOMRect | null>(
    () => null,
  )

  const registerViewport = React.useCallback((el: HTMLDivElement | null) => {
    viewportRef.current = el
  }, [])
  const registerWorld = React.useCallback((el: HTMLDivElement | null) => {
    worldRef.current = el
  }, [])

  const getScale = React.useCallback(() => getScaleRef.current(), [])
  const setScaleRef = React.useCallback((get: () => number) => {
    getScaleRef.current = get
  }, [])
  const getViewportRect = React.useCallback(
    () => viewportRef.current?.getBoundingClientRect() ?? null,
    [],
  )
  const getWorldRect = React.useCallback(
    () => worldRef.current?.getBoundingClientRect() ?? null,
    [],
  )
  const getRackRect = React.useCallback(
    (rackIndex: number) => getRackRectRef.current(rackIndex),
    [],
  )
  const setGetRackRect = React.useCallback(
    (get: (rackIndex: number) => DOMRect | null) => {
      getRackRectRef.current = get
    },
    [],
  )

  // Wires refresh hooks supplied by Connections context
  const beginGeometryRefresh = React.useCallback(() => {
    try {
      window.dispatchEvent(new Event('wires:refresh'))
    } catch {}
  }, [])
  const endGeometryRefresh = React.useCallback(() => {
    try {
      window.dispatchEvent(new Event('wires:refresh'))
    } catch {}
  }, [])
  const scheduleWireRefresh = React.useCallback(() => {
    try {
      window.dispatchEvent(new Event('wires:refresh'))
    } catch {}
  }, [])

  const getEngine = React.useCallback(() => {
    if (engineRef.current) return engineRef.current
    engineRef.current = new LayoutEngine({
      getScale,
      getViewportRect,
      getWorldRect,
      getRackRect,
      rowHeightPx,
      numRows,
      onScheduleWireRefresh: scheduleWireRefresh,
    })
    return engineRef.current
  }, [
    getScale,
    getViewportRect,
    getWorldRect,
    getRackRect,
    rowHeightPx,
    numRows,
    scheduleWireRefresh,
  ])

  const value: LayoutContextValue = React.useMemo(
    () => ({
      engineRef: {
        get current() {
          return getEngine()
        },
        set current(v: LayoutEngine | null) {
          engineRef.current = v
        },
      } as unknown as MutableRefObject<LayoutEngine | null>,
      registerViewport,
      registerWorld,
      getScale,
      setScaleRef,
      getRackRect,
      setGetRackRect,
      beginGeometryRefresh,
      endGeometryRefresh,
      scheduleWireRefresh,
    }),
    [
      getEngine,
      registerViewport,
      registerWorld,
      getScale,
      setScaleRef,
      getRackRect,
      setGetRackRect,
      beginGeometryRefresh,
      endGeometryRefresh,
      scheduleWireRefresh,
    ],
  )

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  )
}
