import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { Header } from '@/components/layout/header'
import { usePatchManager } from '@/components/patch-manager'
import { useSettings } from '@/components/settings-context'
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
  const { connections, removeConnection } = useConnections()
  const { open } = useSettings()
  const { toast } = useToast()
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false)

  const [dragState, setDragState] = useState<{
    isDragging: boolean
    draggedModule: ModuleInstance | null
    draggedFromRack: number
    dropIndex: number | null
    dropRack: number | null
    mouseX: number
  }>({
    isDragging: false,
    draggedModule: null,
    draggedFromRack: 1,
    dropIndex: null,
    dropRack: null,
    mouseX: 0,
  })

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
  }>(null)

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
          () => viewportRef.current?.getBoundingClientRect() ?? null,
          (idx: number) =>
            rackRefs.current[idx - 1]?.getBoundingClientRect() ?? null,
          () => {
            // keep wires fresh during drag
            try {
              // lightweight refresh via resize event (already wired for wires)
              window.dispatchEvent(new Event('resize'))
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

  const getNearestRackByClientY = (clientY: number): number => {
    // Pick the rack whose vertical center is closest
    let bestRack = 1
    let bestDist = Infinity
    for (let i = 1; i <= NUM_ROWS; i++) {
      const r = getRackRect(i)
      if (!r) continue
      const cy = r.top + r.height / 2
      const dist = Math.abs(clientY - cy)
      if (dist < bestDist) {
        bestDist = dist
        bestRack = i
      }
    }
    return bestRack
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
      if (
        m.type === 'sequencer' ||
        m.type === 'quantizer' ||
        m.type === 'euclid'
      )
        return 3
      return 1
    }
    for (const m of modules) {
      const rackIndex = getEffectiveRackNumber(m)
      byRack[rackIndex - 1].push(m)
    }
    return byRack
  }, [modules])

  const handleDragStart = useCallback(
    (e: React.DragEvent, module: ModuleInstance, fromRack: number) => {
      e.dataTransfer.effectAllowed = 'move'
      setDragState({
        isDragging: true,
        draggedModule: module,
        draggedFromRack: fromRack,
        dropIndex: null,
        dropRack: null,
        mouseX: e.clientX,
      })
    },
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, rack: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (!dragState.isDragging || !dragState.draggedModule) return
      const rackEl = rackRefs.current[rack - 1]
      if (!rackEl) return
      const rackRect = rackEl.getBoundingClientRect()
      const relativeX = e.clientX - rackRect.left
      let dropIdx = 0
      const moduleElements = rackEl.querySelectorAll('[draggable]')
      for (let i = 0; i < moduleElements.length; i++) {
        const moduleRect = moduleElements[i].getBoundingClientRect()
        const moduleMidpoint =
          moduleRect.left + moduleRect.width / 2 - rackRect.left
        if (relativeX > moduleMidpoint) {
          dropIdx = i + 1
        }
      }
      setDragState((prev) => ({
        ...prev,
        dropIndex: dropIdx,
        dropRack: rack,
        mouseX: e.clientX,
      }))
    },
    [dragState],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, rack: number) => {
      e.preventDefault()
      if (
        !dragState.isDragging ||
        !dragState.draggedModule ||
        dragState.dropIndex === null
      )
        return
      const draggedModule = dragState.draggedModule
      let dropIndex = dragState.dropIndex

      // Group modules by rack (including dragged) to compute original index
      const allByRack: ModuleInstance[][] = Array.from(
        { length: NUM_ROWS },
        () => [],
      )
      const getEffectiveRackNumber = (m: ModuleInstance) => {
        if (m.rack && m.rack >= 1 && m.rack <= NUM_ROWS) return m.rack
        if (
          m.type === 'sequencer' ||
          m.type === 'quantizer' ||
          m.type === 'euclid'
        )
          return 3
        return 1
      }
      for (const m of modules) {
        const r = getEffectiveRackNumber(m)
        allByRack[r - 1].push(m)
      }

      if (rack === dragState.draggedFromRack) {
        const sourceRackModules = allByRack[rack - 1]
        const draggedIndex = sourceRackModules.findIndex(
          (m) => m.id === draggedModule.id,
        )
        if (draggedIndex !== -1 && dropIndex > draggedIndex) {
          dropIndex--
        }
      }

      // Group modules by rack (without dragged) for reconstruction
      const withoutDragged = modules.filter((m) => m.id !== draggedModule.id)
      const byRackWithout: ModuleInstance[][] = Array.from(
        { length: NUM_ROWS },
        () => [],
      )
      for (const m of withoutDragged) {
        const r = getEffectiveRackNumber(m)
        byRackWithout[r - 1].push(m)
      }

      byRackWithout[rack - 1].splice(dropIndex, 0, {
        ...draggedModule,
        rack,
      })

      const newModules = byRackWithout.flat()
      setModules(newModules)

      setDragState({
        isDragging: false,
        draggedModule: null,
        draggedFromRack: 1,
        dropIndex: null,
        dropRack: null,
        mouseX: 0,
      })
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'))
      }, 50)
    },
    [dragState, modules, setModules],
  )

  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedModule: null,
      draggedFromRack: 1,
      dropIndex: null,
      dropRack: null,
      mouseX: 0,
    })
  }, [])

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
                    onDragOver={(e) => handleDragOver(e, rackNum)}
                    onDrop={(e) => handleDrop(e, rackNum)}
                    onDragEnd={handleDragEnd}
                  >
                    {rowModules.map((module: ModuleInstance, index: number) => (
                      <div
                        key={module.id}
                        ref={(el) => {
                          if (el) moduleRefs.current.set(module.id, el)
                          else moduleRefs.current.delete(module.id)
                          // Register with controller
                          const ctrl = ensureController(rackNum)
                          if (el)
                            ctrl.registerModule(
                              rackNum,
                              module.id,
                              el,
                              module.x ?? index * 240,
                            )
                        }}
                        data-module-id={module.id}
                        className="absolute top-0 h-full"
                        style={{ left: module.x ?? index * 240 }}
                        onPointerDown={(e) => {
                          e.preventDefault()
                          const header = (e.target as HTMLElement).closest(
                            '.module-header',
                          )
                          if (!header) return
                          const targetEl = e.currentTarget as HTMLElement
                          try {
                            targetEl.setPointerCapture(e.pointerId)
                          } catch {}
                          const ctrl = ensureController(rackNum)
                          ctrl.startDrag(
                            module.id,
                            rackNum,
                            e.clientX,
                            e.clientY,
                          )
                          const rackRect = getRackRect(rackNum)
                          const scale = scaleRef.current
                          const modEl = moduleRefs.current.get(module.id)
                          const modWidth =
                            (modEl?.getBoundingClientRect().width || 240) /
                            scale
                          const pointerXRack = rackRect
                            ? (e.clientX - rackRect.left) / scale
                            : 0
                          const pointerOffsetXRack =
                            pointerXRack - (module.x ?? 0)
                          dragCtxRef.current = {
                            moduleId: module.id,
                            fromRack: rackNum,
                            pointerOffsetXRack,
                            moduleWidth: modWidth,
                            startClientX: e.clientX,
                            startClientY: e.clientY,
                          }
                          const onMove = (ev: PointerEvent) => {
                            const ctx = dragCtxRef.current
                            if (!ctx) return
                            // Live horizontal packing in original rack only (cross-rack preview skipped for perf)
                            ctrl.updateDrag(ev.clientX, ev.clientY)
                          }
                          const onUp = (ev: PointerEvent) => {
                            try {
                              targetEl.releasePointerCapture(e.pointerId)
                            } catch {}
                            targetEl.removeEventListener('pointermove', onMove)
                            targetEl.removeEventListener('pointerup', onUp)
                            const dropRack = getNearestRackByClientY(ev.clientY)
                            const worldScale = scaleRef.current
                            if (dropRack === rackNum) {
                              const result = ctrl.endDrag()
                              if (result) {
                                setModules((prev) =>
                                  prev.map((m) =>
                                    m.id === result.id
                                      ? { ...m, rack: result.rack, x: result.x }
                                      : (() => {
                                          const u = result.updates.find(
                                            (uu) => uu.id === m.id,
                                          )
                                          return u ? { ...m, x: u.x } : m
                                        })(),
                                  ),
                                )
                              }
                            } else {
                              // Move to another rack: compute pack for source and target racks
                              const rackRectFrom = getRackRect(rackNum)
                              const rackRectTo = getRackRect(dropRack)
                              if (
                                !rackRectFrom ||
                                !rackRectTo ||
                                !dragCtxRef.current
                              ) {
                                ctrl.endDrag()
                                dragCtxRef.current = null
                                return
                              }
                              // Source rack: pack remaining modules without dragged
                              const fromModules = (
                                modulesByRack[rackNum - 1] || []
                              ).filter((m) => m.id !== module.id)
                              const fromExisting = fromModules.map((m) => {
                                const el = moduleRefs.current.get(m.id)
                                const w =
                                  (el?.getBoundingClientRect().width || 240) /
                                  worldScale
                                return { id: m.id, x: m.x ?? 0, w }
                              })
                              const fromRowWidth =
                                rackRectFrom.width / worldScale
                              const fromUpdates = packWithout(
                                fromExisting,
                                fromRowWidth,
                              )

                              // Target rack: pack with virtual dragged at desiredX
                              const toModules = (
                                modulesByRack[dropRack - 1] || []
                              ).filter((m) => m.id !== module.id)
                              const toExisting = toModules.map((m) => {
                                const el = moduleRefs.current.get(m.id)
                                const w =
                                  (el?.getBoundingClientRect().width || 240) /
                                  worldScale
                                return { id: m.id, x: m.x ?? 0, w }
                              })
                              const xInRackTo =
                                (ev.clientX - rackRectTo.left) / worldScale
                              const desiredXTo =
                                xInRackTo -
                                dragCtxRef.current.pointerOffsetXRack
                              const toRowWidth = rackRectTo.width / worldScale
                              const { updates: toUpdates, draggedX } =
                                packWithVirtual(
                                  toExisting,
                                  {
                                    x: desiredXTo,
                                    w: dragCtxRef.current.moduleWidth,
                                  },
                                  toRowWidth,
                                )

                              // Commit state updates
                              setModules((prev) =>
                                prev.map((m) => {
                                  if (m.id === module.id) {
                                    return { ...m, rack: dropRack, x: draggedX }
                                  }
                                  const uFrom = fromUpdates.find(
                                    (u) => u.id === m.id,
                                  )
                                  if (uFrom) return { ...m, x: uFrom.x }
                                  const uTo = toUpdates.find(
                                    (u) => u.id === m.id,
                                  )
                                  if (uTo) return { ...m, x: uTo.x }
                                  return m
                                }),
                              )

                              // Ensure controller clears transforms
                              ctrl.endDrag()
                            }
                            dragCtxRef.current = null
                          }
                          targetEl.addEventListener('pointermove', onMove)
                          targetEl.addEventListener('pointerup', onUp)
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
                    {dragState.isDragging &&
                      dragState.dropRack === rackNum &&
                      dragState.dropIndex === rowModules.length && (
                        <DragIndicator />
                      )}
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
