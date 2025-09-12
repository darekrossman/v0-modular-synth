'use client'

import * as React from 'react'
import { useLayout } from '@/components/layout-context'
import { toPx } from '@/lib/layout/pack'
import { availableModules, type ModuleInstance } from '@/lib/module-registry'

export function ModuleLayer({
  modules,
  getHpForTypeAction,
  onCommitAction,
}: {
  modules: ModuleInstance[]
  getHpForTypeAction: (t: string) => number
  onCommitAction: (
    updates: Array<{ id: string; rack: number; xHp: number }>,
  ) => void
}) {
  const { engineRef, beginGeometryRefresh, endGeometryRefresh } = useLayout()
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  const getModuleWidthPx = React.useCallback(
    (type: string, hpOverride?: number) => {
      const hp = hpOverride ?? getHpForTypeAction(type)
      return toPx(hp)
    },
    [getHpForTypeAction],
  )

  // Register modules on mount/update
  React.useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    const present = new Set<string>()
    for (const m of modules) {
      present.add(m.id)
      const el = document.querySelector<HTMLElement>(
        `[data-module-wrapper-id="${m.id}"]`,
      )
      if (!el) continue
      const w = getModuleWidthPx(m.type, m.hp)
      eng.registerModule(
        m.id,
        el,
        { w, h: 0 },
        { xHp: m.xHp, x: m.x, rack: m.rack },
      )
    }
    // Unregister stale modules by DOM absence
    for (const m of modules) {
      const el = document.querySelector<HTMLElement>(
        `[data-module-wrapper-id="${m.id}"]`,
      )
      if (!el) {
        eng.unregisterModule(m.id)
      }
    }
  }, [modules, engineRef, getModuleWidthPx])

  const getComponent = (type: string) =>
    availableModules.find((m) => m.type === type)?.component

  const onPointerDown = (e: React.PointerEvent, m: ModuleInstance) => {
    const header = (e.target as HTMLElement).closest('.module-header')
    if (!header) return
    e.preventDefault()
    const targetEl = e.currentTarget as HTMLElement
    try {
      targetEl.setPointerCapture(e.pointerId)
    } catch {}
    const eng = engineRef.current
    if (!eng) return
    beginGeometryRefresh()
    eng.beginDrag(m.id, e.pointerId, e.clientX, e.clientY)
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      eng.updateDrag(ev.clientX, ev.clientY)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      try {
        targetEl.releasePointerCapture(e.pointerId)
      } catch {}
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      const res = eng.endDrag()
      if (res?.updates?.length) onCommitAction(res.updates)
      endGeometryRefresh()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
    >
      {modules.map((m) => {
        const Cmp = getComponent(m.type)
        if (!Cmp) return null
        return (
          <div
            key={m.id}
            data-module-wrapper-id={m.id}
            className="absolute top-0 h-[520px]"
            style={{ pointerEvents: 'auto' }}
            onPointerDown={(e) => onPointerDown(e, m)}
          >
            <Cmp moduleId={m.id} />
          </div>
        )
      })}
    </div>
  )
}
