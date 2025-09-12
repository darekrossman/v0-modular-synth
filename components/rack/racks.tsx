import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { Header } from '@/components/layout/header'
import { usePatchManager } from '@/components/patch-manager'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WireCanvas } from '@/components/wire-canvas'
import { useToast } from '@/hooks/use-toast'
import { RackLayoutController } from '@/lib/layout-controller'
import {
  availableModules,
  type ModuleInstance,
  type ModuleType,
} from '@/lib/module-registry'
import { cn } from '@/lib/utils'
import { DraggableModuleItem, DragIndicator } from './draggable-item'

interface RacksProps {
  modules: ModuleInstance[]
  setModules: React.Dispatch<React.SetStateAction<ModuleInstance[]>>
  addModule: (type: ModuleType) => void
  removeModule: (moduleId: string) => void
}

export function Racks({
  modules,
  setModules,
  addModule,
  removeModule,
}: RacksProps) {
  const { loadDefaultPatch, currentPatch, updateCurrentPatch } =
    usePatchManager()
  const {
    connections,
    removeConnection,
    beginGeometryRefresh,
    endGeometryRefresh,
  } = useConnections()
  const { toast } = useToast()
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false)

  const rackRefs = useRef<(HTMLDivElement | null)[]>([])
  const moduleRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const controllersRef = useRef<Map<number, RackLayoutController>>(new Map())
  const dragCtxRef = useRef<null | {
    moduleId: string
    fromRack: number
    pointerOffsetXRack: number
    moduleWidth: number
    startClientX: number
    startClientY: number
    pointerId: number
    captureEl?: HTMLElement
  }>(null)
  const lastHandoffTsRef = useRef<number>(0)
  const lastHandoffRackRef = useRef<number | null>(null)

  const getCurrentXFromEl = useCallback((el: HTMLElement): number => {
    const left = Number.parseFloat(el.style.left || '0') || 0
    const cs = getComputedStyle(el)
    const t = cs.transform || (cs as any).webkitTransform || ''
    let tx = 0
    if (t && t !== 'none') {
      const m = t.match(/matrix(3d)?\(([^)]+)\)/)
      if (m) {
        const parts = m[2]
          .split(',')
          .map((s: string) => Number.parseFloat(s.trim()))
        tx = m[1] === '3d' ? parts[12] || 0 : parts[4] || 0
      }
    }
    return left + tx
  }, [])

  // Viewport/world for transform-based panning
  const WORLD_WIDTH = 10000
  const ROW_HEIGHT_PX = 520
  const NUM_ROWS = 16
  const WORLD_HEIGHT = NUM_ROWS * ROW_HEIGHT_PX + 16
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  // Camera stored in ref; DOM transform is updated imperatively for perf
  const cameraRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const pendingApplyRef = useRef(false)
  const isSpaceHeldRef = useRef(false)
  const [isSpaceHeld, setIsSpaceHeld] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const cameraStartRef = useRef<{ x: number; y: number } | null>(null)
  // Zoom state
  const scaleRef = useRef<number>(1)
  const [scale, _setScale] = useState<number>(1)

  const applyTransform = useCallback(() => {
    pendingApplyRef.current = false
    const el = worldRef.current
    if (!el) return
    const { x, y } = cameraRef.current
    const s = scaleRef.current
    const viewportEl = viewportRef.current
    const viewportWidth = viewportEl?.clientWidth ?? 0
    const viewportHeight = viewportEl?.clientHeight ?? 0
    const originX = viewportWidth / 2 - x
    const originY = viewportHeight / 2 - y
    el.style.transformOrigin = `${originX}px ${originY}px`
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`
  }, [])

  const scheduleApply = useCallback(() => {
    if (pendingApplyRef.current) return
    pendingApplyRef.current = true
    rafRef.current = requestAnimationFrame(applyTransform)
  }, [applyTransform])

  const clampCameraToBounds = useCallback(
    (xWanted: number, yWanted: number, scaleOverride?: number) => {
      const viewportEl = viewportRef.current
      const viewportWidth = viewportEl?.clientWidth ?? 0
      const viewportHeight = viewportEl?.clientHeight ?? 0
      const s = scaleOverride ?? scaleRef.current
      if (!viewportWidth || !viewportHeight || s <= 0) {
        return { x: xWanted, y: yWanted }
      }
      // Bounds with transform-origin anchored to viewport center.
      // transform is: translate(x,y) scale(s), applied right-to-left => scale then translate.
      // With origin O = (viewportWidth/2 - x, viewportHeight/2 - y), the edge constraints yield:
      // x ∈ [ (viewportWidth - s*WORLD_WIDTH - (1 - s)*viewportWidth/2) / s, -((1 - s)/s) * viewportWidth/2 ]
      // y ∈ [ (viewportHeight - s*WORLD_HEIGHT - (1 - s)*viewportHeight/2) / s, -((1 - s)/s) * viewportHeight/2 ]
      const oneMinusOverS = (1 - s) / s
      const minX =
        (viewportWidth - s * WORLD_WIDTH - (1 - s) * (viewportWidth / 2)) / s
      const maxX = -oneMinusOverS * (viewportWidth / 2)
      const minY =
        (viewportHeight - s * WORLD_HEIGHT - (1 - s) * (viewportHeight / 2)) / s
      const maxY = -oneMinusOverS * (viewportHeight / 2)

      let x = xWanted
      let y = yWanted
      if (minX > maxX) {
        x = (minX + maxX) / 2
      } else {
        x = Math.max(minX, Math.min(maxX, xWanted))
      }
      if (minY > maxY) {
        y = (minY + maxY) / 2
      } else {
        y = Math.max(minY, Math.min(maxY, yWanted))
      }
      return { x, y }
    },
    [WORLD_WIDTH, WORLD_HEIGHT],
  )

  const setScale = useCallback(
    (next: number) => {
      const minScale = 0.2
      const maxScale = 3
      const clamped = Math.min(
        maxScale,
        Math.max(minScale, Number.parseFloat(next.toFixed(3)) ?? 1),
      )
      if (clamped === scaleRef.current) return
      scaleRef.current = clamped
      _setScale(clamped)
      // Re-clamp camera under new scale
      const { x, y } = clampCameraToBounds(
        cameraRef.current.x,
        cameraRef.current.y,
        clamped,
      )
      cameraRef.current = { x, y }
      scheduleApply()
    },
    [clampCameraToBounds, scheduleApply],
  )

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const wantedX = cameraRef.current.x + dx
      const wantedY = cameraRef.current.y + dy
      const { x, y } = clampCameraToBounds(wantedX, wantedY)
      cameraRef.current = { x, y }
      scheduleApply()
    },
    [scheduleApply, clampCameraToBounds],
  )

  // ---- Layout controllers setup ----
  const ensureController = useCallback(
    (rackNum: number): RackLayoutController => {
      let ctrl = controllersRef.current.get(rackNum)
      if (!ctrl) {
        ctrl = new RackLayoutController(
          () => scaleRef.current,
          (idx: number) =>
            rackRefs.current[idx - 1]?.getBoundingClientRect() ?? null,
          () => {
            // keep wires fresh during drag
            try {
              window.dispatchEvent(new Event('wires:refresh'))
            } catch {}
          },
        )
        controllersRef.current.set(rackNum, ctrl)
      }
      return ctrl
    },
    [],
  )

  const getRackRect = (rackNum: number) =>
    rackRefs.current[rackNum - 1]?.getBoundingClientRect() ?? null

  // Discrete HP grid helpers
  const HP_PX = 20
  const toPx = (hp: number) => hp * HP_PX
  const toHp = (px: number) => Math.max(0, Math.round(px / HP_PX))
  const getModuleHp = (type: ModuleType): number => {
    const entry = availableModules.find((m) => m.type === type)
    return entry?.hp ?? 9
  }

  // Packing helpers (world/rack-local coordinates)
  const packWithVirtual = (
    existing: Array<{ id: string; x: number; w: number }>,
    insert: { x: number; w: number },
    rowWidth: number,
  ) => {
    const GAP = 8
    const clampedX = Math.max(
      0,
      Math.min(Math.max(0, rowWidth - insert.w), insert.x),
    )
    const all = [
      ...existing.map((m) => ({ ...m })),
      { id: '__virtual__', x: clampedX, w: insert.w },
    ]
    all.sort((a, b) => a.x - b.x)
    // Sweep right
    for (let i = 0; i < all.length - 1; i++) {
      const a = all[i]
      const b = all[i + 1]
      const minB = a.x + a.w + GAP
      if (b.x < minB) b.x = minB
    }
    // Sweep left
    for (let i = all.length - 1; i > 0; i--) {
      const b = all[i]
      const a = all[i - 1]
      const maxA = b.x - a.w - GAP
      if (a.x > maxA) a.x = maxA
    }
    const updates = existing.map((m) => {
      const after = all.find((x) => x.id === m.id)
      return { id: m.id, x: after ? after.x : m.x }
    })
    const draggedAfter = all.find((x) => x.id === '__virtual__')
    return { updates, draggedX: draggedAfter ? draggedAfter.x : clampedX }
  }

  const packWithout = (
    existing: Array<{ id: string; x: number; w: number }>,
    rowWidth: number,
  ) => {
    // Simple left-to-right pack preserving order and gaps
    const GAP = 8
    const sorted = existing.slice().sort((a, b) => a.x - b.x)
    const updates: Array<{ id: string; x: number }> = []
    let cursor = 0
    for (let i = 0; i < sorted.length; i++) {
      const nx = Math.max(
        0,
        Math.min(
          Math.max(0, rowWidth - sorted[i].w),
          Math.max(cursor, sorted[i].x),
        ),
      )
      if (nx !== sorted[i].x) updates.push({ id: sorted[i].id, x: nx })
      cursor = nx + sorted[i].w + GAP
    }
    return updates
  }

  // Load the example patch once on initial mount
  useEffect(() => {
    loadDefaultPatch()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)
      ) {
        return
      }
      // Space to enter panning mode
      if (event.code === 'Space') {
        if (!isSpaceHeldRef.current) {
          isSpaceHeldRef.current = true
          setIsSpaceHeld(true)
        }
        event.preventDefault()
        return
      }
      // Zoom controls
      if (event.key === '[') {
        event.preventDefault()
        setScale(scaleRef.current - 0.1)
        return
      }
      if (event.key === ']') {
        event.preventDefault()
        setScale(scaleRef.current + 0.1)
        return
      }
      if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        if (currentPatch) {
          updateCurrentPatch()
          toast({
            title: 'Patch saved',
            description: `"${currentPatch.name}" has been saved successfully.`,
          })
        }
        return
      }
      if (
        event.key.toLowerCase() === 'm' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault()
        setIsModuleDialogOpen((prev) => !prev)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        isSpaceHeldRef.current = false
        setIsSpaceHeld(false)
        setIsPanning(false)
      }
    }
    const handleBlur = () => {
      isSpaceHeldRef.current = false
      setIsSpaceHeld(false)
      setIsPanning(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [currentPatch, updateCurrentPatch, toast])

  // Wheel disabled; only pan when space is held (still prevent native scroll)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const scale = e.deltaMode === 1 ? 16 : 1
      const dx = e.deltaX * scale
      const dy = e.deltaY * scale
      panBy(-dx, -dy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [panBy])

  const handleDeleteModule = useCallback(
    (moduleId: string) => {
      connections.forEach((connection) => {
        if (
          connection.from.startsWith(moduleId) ||
          connection.to.startsWith(moduleId)
        ) {
          removeConnection(connection.id)
        }
      })
      removeModule(moduleId)
    },
    [connections, removeConnection, removeModule],
  )

  const handleModuleSelect = useCallback(
    (moduleType: ModuleType) => {
      console.time('addModule')
      addModule(moduleType)
      console.timeEnd('addModule')
    },
    [addModule],
  )

  const modulesByRack = useMemo(() => {
    const byRack: ModuleInstance[][] = Array.from(
      { length: NUM_ROWS },
      () => [],
    )
    const getEffectiveRackNumber = (m: ModuleInstance) => {
      if (m.rack && m.rack >= 1 && m.rack <= NUM_ROWS) return m.rack
      return 1
    }
    for (const m of modules) {
      const rackIndex = getEffectiveRackNumber(m)
      byRack[rackIndex - 1].push(m)
    }
    return byRack
  }, [modules])

  console.log('rack')

  return (
    <main className="h-screen bg-background flex flex-col relative">
      <Header openAddModuleDialog={() => setIsModuleDialogOpen(true)} />

      <RackDivider />

      <div
        id="racks"
        ref={viewportRef}
        className="flex-1 relative bg-black overflow-hidden overscroll-none"
      >
        {/* Pan overlay captures drag when space is held */}
        {isSpaceHeld && (
          <div
            className={cn(
              'absolute inset-0 z-50',
              isPanning ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{ userSelect: 'none' }}
            onPointerDown={(e) => {
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              setIsPanning(true)
              panStartRef.current = { x: e.clientX, y: e.clientY }
              cameraStartRef.current = { ...cameraRef.current }
            }}
            onPointerMove={(e) => {
              if (!isPanning || !panStartRef.current || !cameraStartRef.current)
                return
              const dx = e.clientX - panStartRef.current.x
              const dy = e.clientY - panStartRef.current.y
              // drag-to-pan: move world with the cursor
              const wantedX = cameraStartRef.current.x + dx
              const wantedY = cameraStartRef.current.y + dy
              const { x, y } = clampCameraToBounds(wantedX, wantedY)
              cameraRef.current = { x, y }
              scheduleApply()
            }}
            onPointerUp={(e) => {
              try {
                ;(e.currentTarget as HTMLElement).releasePointerCapture(
                  e.pointerId,
                )
              } catch {}
              setIsPanning(false)
              panStartRef.current = null
              cameraStartRef.current = null
            }}
            onPointerCancel={() => {
              setIsPanning(false)
              panStartRef.current = null
              cameraStartRef.current = null
            }}
          />
        )}

        {/* World that translates with camera */}
        <div
          id="racks-world"
          ref={worldRef}
          className="absolute top-0 left-0"
          style={{
            width: WORLD_WIDTH,
            height: WORLD_HEIGHT,
            willChange: 'transform',
          }}
        >
          {/* WireCanvas now moves with the world */}
          <WireCanvas />

          {Array.from({ length: NUM_ROWS }, (_, idx) => {
            const rackNum = idx + 1
            const rowModules = modulesByRack[idx] || []
            return (
              <React.Fragment key={`rack-row-${rackNum}`}>
                <RackRow>
                  <div
                    ref={(el) => {
                      rackRefs.current[idx] = el
                    }}
                    className="flex relative items-stretch h-full z-1"
                  >
                    {rowModules.map((module: ModuleInstance, index: number) => (
                      <div
                        key={module.id}
                        ref={(el) => {
                          const ctrl = ensureController(rackNum)
                          if (el) {
                            moduleRefs.current.set(module.id, el)
                            // Register with controller using baseX in px aligned to HP grid when available
                            ctrl.registerModule(
                              rackNum,
                              module.id,
                              el,
                              module.xHp !== undefined
                                ? toPx(module.xHp)
                                : (module.x ?? index * 240),
                            )
                          } else {
                            moduleRefs.current.delete(module.id)
                            // Unregister when element is detached
                            ctrl.unregisterModule(module.id)
                          }
                        }}
                        data-module-id={module.id}
                        className="absolute top-0 h-full"
                        style={{
                          left:
                            module.xHp !== undefined
                              ? toPx(module.xHp)
                              : (module.x ?? index * 240),
                          width: toPx(module.hp ?? getModuleHp(module.type)),
                        }}
                        onPointerDown={(e) => {
                          const header = (e.target as HTMLElement).closest(
                            '.module-header',
                          )
                          if (!header) return
                          e.preventDefault()
                          const targetEl = e.currentTarget as HTMLElement
                          try {
                            targetEl.setPointerCapture(e.pointerId)
                          } catch {}
                          const rackRect = getRackRect(rackNum)
                          const scale = scaleRef.current
                          const pointerXRack = rackRect
                            ? (e.clientX - rackRect.left) / scale
                            : 0

                          const pointerOffsetHp =
                            (pointerXRack -
                              (module.xHp !== undefined
                                ? toPx(module.xHp)
                                : (module.x ?? 0))) /
                            HP_PX
                          dragCtxRef.current = {
                            moduleId: module.id,
                            fromRack: rackNum,
                            pointerOffsetXRack: pointerOffsetHp,
                            moduleWidth: toPx(
                              module.hp ?? getModuleHp(module.type),
                            ),
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                            pointerId: e.pointerId,
                            captureEl: targetEl,
                          }
                          // Start controller-driven drag
                          const ctrl = ensureController(rackNum)
                          ctrl.startDrag(
                            module.id,
                            rackNum,
                            e.clientX,
                            e.clientY,
                          )
                          beginGeometryRefresh()
                          const onMove = (ev: PointerEvent) => {
                            const ctxNow = dragCtxRef.current
                            if (!ctxNow || ev.pointerId !== ctxNow.pointerId)
                              return
                            const activeCtx = dragCtxRef.current
                            if (!activeCtx) return
                            let activeRack = activeCtx.fromRack

                            // Immediate vertical rack snapping by threshold
                            const SNAP_Y = 80 // px vertical threshold to handoff to adjacent rack
                            const activeRect = getRackRect(activeRack)
                            if (activeRect) {
                              const above = ev.clientY < activeRect.top - SNAP_Y
                              const below =
                                ev.clientY > activeRect.bottom + SNAP_Y
                              let targetRack = activeRack
                              if (above && activeRack > 1)
                                targetRack = activeRack - 1
                              if (below && activeRack < NUM_ROWS)
                                targetRack = activeRack + 1

                              if (targetRack !== activeRack) {
                                // Hysteresis to avoid rapid ping-pong handoffs
                                const now = performance.now()
                                if (
                                  lastHandoffRackRef.current === targetRack &&
                                  now - lastHandoffTsRef.current < 120
                                ) {
                                  // Skip too-soon repeat handoff
                                } else {
                                  // Handoff drag to target rack without React state updates
                                  const prevCtrl = ensureController(activeRack)
                                  const el = moduleRefs.current.get(module.id)
                                  const currentXpx = el
                                    ? getCurrentXFromEl(el)
                                    : 0
                                  // End previous drag and unregister
                                  prevCtrl.endDrag()
                                  prevCtrl.unregisterModule(module.id)

                                  // Move DOM node
                                  const targetRackEl =
                                    rackRefs.current[targetRack - 1]
                                  if (el && targetRackEl) {
                                    try {
                                      targetRackEl.appendChild(el)
                                    } catch {}
                                    el.style.left = `${currentXpx}px`
                                    el.style.transform = ''
                                  }

                                  // Register and start drag in new controller
                                  const nextCtrl = ensureController(targetRack)
                                  if (el)
                                    nextCtrl.registerModule(
                                      targetRack,
                                      module.id,
                                      el,
                                      currentXpx,
                                    )
                                  nextCtrl.startDrag(
                                    module.id,
                                    targetRack,
                                    ev.clientX,
                                    ev.clientY,
                                  )

                                  // Update active rack in drag context
                                  dragCtxRef.current = {
                                    ...activeCtx,
                                    fromRack: targetRack,
                                  }
                                  activeRack = targetRack
                                  lastHandoffRackRef.current = targetRack
                                  lastHandoffTsRef.current = now
                                }
                              }
                            }

                            // Continue drag within the active rack controller
                            const ctrl = ensureController(activeRack)
                            ctrl.updateDrag(ev.clientX, ev.clientY)
                          }
                          const onUp = (ev: PointerEvent) => {
                            const ctxNow = dragCtxRef.current
                            // Ensure we only handle our pointer
                            if (!ctxNow || ev.pointerId !== ctxNow.pointerId)
                              return
                            try {
                              ctxNow.captureEl?.releasePointerCapture(
                                ctxNow.pointerId,
                              )
                            } catch {}
                            window.removeEventListener('pointermove', onMove)
                            window.removeEventListener('pointerup', onUp)
                            const finalRack =
                              dragCtxRef.current?.fromRack ?? rackNum
                            const ctrl = ensureController(finalRack)
                            const result = ctrl.endDrag()
                            // Commit positions on HP grid with minimal React updates
                            setModules((prev) => {
                              const HP_TO_PX = HP_PX
                              // Helper to convert px to hp
                              const pxToHp = (px: number) =>
                                Math.max(0, Math.round(px / HP_TO_PX))

                              if (!result) return prev
                              const draggedId = result.id
                              const sameRack = finalRack === result.rack

                              if (sameRack) {
                                // Apply controller's resolved positions directly for this rack
                                const updatesMap = new Map<string, number>()
                                for (const u of result.updates)
                                  updatesMap.set(u.id, pxToHp(u.x))
                                return prev.map((m) => {
                                  if (
                                    updatesMap.has(m.id) &&
                                    (m.rack ?? rackNum) === result.rack
                                  ) {
                                    const newHp = updatesMap.get(m.id)
                                    return {
                                      ...m,
                                      xHp: newHp,
                                      rack: result.rack,
                                    }
                                  }
                                  return m
                                })
                              }

                              // Cross-rack drop: remove from source rack and pack both racks
                              const sourceRack = result.rack
                              const targetRack = finalRack
                              const dragged = prev.find(
                                (m) => m.id === draggedId,
                              )
                              if (!dragged) return prev

                              const sourceRect = getRackRect(sourceRack)
                              const targetRect = getRackRect(targetRack)
                              const scaleNow = scaleRef.current
                              const sourceWidth = sourceRect
                                ? sourceRect.width / scaleNow
                                : 0
                              const targetWidth = targetRect
                                ? targetRect.width / scaleNow
                                : 0

                              // Build existing arrays in px
                              const getW = (m: ModuleInstance) =>
                                toPx(m.hp ?? getModuleHp(m.type))
                              const getXpx = (
                                m: ModuleInstance,
                                idx: number,
                              ) =>
                                m.xHp !== undefined
                                  ? toPx(m.xHp)
                                  : (m.x ?? idx * 240)

                              const sourceExisting = prev
                                .filter(
                                  (m) =>
                                    (m.rack ?? 1) === sourceRack &&
                                    m.id !== draggedId,
                                )
                                .map((m, idx) => ({
                                  id: m.id,
                                  x: getXpx(m, idx),
                                  w: getW(m),
                                }))
                              const targetExisting = prev
                                .filter((m) => (m.rack ?? 1) === targetRack)
                                .map((m, idx) => ({
                                  id: m.id,
                                  x: getXpx(m, idx),
                                  w: getW(m),
                                }))

                              // Desired insert X in px for target rack based on cursor and pointer offset
                              const targetXInRack = targetRect
                                ? (ev.clientX - targetRect.left) / scaleNow
                                : 0
                              const pointerOffsetHp = Math.round(
                                dragCtxRef.current?.pointerOffsetXRack ?? 0,
                              )
                              const desiredHp = Math.max(
                                0,
                                toHp(targetXInRack) - pointerOffsetHp,
                              )
                              const desiredPx = toPx(desiredHp)

                              // Use packing helpers to resolve overlaps
                              const sourceUpdates = packWithout(
                                sourceExisting,
                                sourceWidth,
                              )
                              const { updates: targetUpdates, draggedX } =
                                packWithVirtual(
                                  targetExisting,
                                  { x: desiredPx, w: getW(dragged) },
                                  targetWidth,
                                )

                              // Apply updates
                              const updatesPxMap = new Map<string, number>()
                              for (const u of sourceUpdates)
                                updatesPxMap.set(u.id, u.x)
                              for (const u of targetUpdates)
                                updatesPxMap.set(u.id, u.x)

                              const next = prev.map((m, idx) => {
                                if (m.id === draggedId) {
                                  return {
                                    ...m,
                                    rack: targetRack,
                                    xHp: pxToHp(draggedX),
                                  }
                                }
                                const px = updatesPxMap.get(m.id)
                                if (px !== undefined) {
                                  return {
                                    ...m,
                                    xHp: pxToHp(px),
                                    rack: m.rack ?? 1,
                                  }
                                }
                                return m
                              })
                              return next
                            })
                            const el = moduleRefs.current.get(module.id)
                            if (el) el.style.transform = ''
                            dragCtxRef.current = null
                            endGeometryRefresh()
                          }
                          // Use window-level listeners to avoid losing events during DOM reparenting
                          window.addEventListener('pointermove', onMove)
                          window.addEventListener('pointerup', onUp)
                        }}
                      >
                        <DraggableModuleItem
                          module={module}
                          index={index}
                          rackModules={rowModules}
                          onDelete={handleDeleteModule}
                          onDragStart={() => {}}
                          isDragging={false}
                          draggedId={undefined}
                        />
                      </div>
                    ))}
                    {/* No HTML5 DnD indicators; pointer-based drag is imperative */}
                  </div>
                </RackRow>
                {rackNum < NUM_ROWS && <RackDivider />}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {/* <div className="flex-1 p-4 flex items-center justify-center text-muted-foreground min-h-16 bg-background"></div> */}

      <RackDivider />

      <Dialog open={isModuleDialogOpen} onOpenChange={setIsModuleDialogOpen}>
        <DialogContent className="max-w-[70vw]! max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>add module</DialogTitle>
            <DialogDescription>
              choose a module to add to your rack.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 mt-4">
            {availableModules.map((module) => (
              <Button
                key={module.type}
                onClick={() => handleModuleSelect(module.type)}
                className="h-auto p-4 flex flex-col items-start gap-2 text-left hover:bg-neutral-900/80 transition-colors whitespace-normal"
              >
                <div className="font-semibold text-sm">{module.name}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {module.description}
                </div>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}

const RackRow = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      className={cn(
        'relative w-full bg-gradient-to-b from-rack-background/80 to-rack-background/85',
        'h-[520px]',
      )}
    >
      <Rail position="top" />
      {children}
      <Rail position="bottom" />
    </div>
  )
}

const RackDivider = () => {
  return <div className="border-t border-white/20" />
}

const Rail = ({ position }: { position: 'top' | 'bottom' }) => {
  return (
    <div
      className={cn('absolute left-0 w-full h-5 bg-rail-background z-0', {
        'bottom-0': position === 'bottom',
        'top-0': position === 'top',
        'shadow-[0_1px_0px_0_rgba(0,0,0,0.4)]': position === 'top',
        'shadow-[0_-1px_0px_0_rgba(255,255,255,0.2)]': position === 'bottom',
      })}
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-white/5 shadow-[0_1px_2px_0_rgba(0,0,0,0.6)]" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5 shadow-[0_-1px_1px_0_rgba(255,255,255,0.2)]" />
    </div>
  )
}
