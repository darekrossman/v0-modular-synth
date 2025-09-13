import { useCallback, useEffect, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { Header } from '@/components/layout/header'
import { LayoutProvider, useLayout } from '@/components/layout-context'
import { usePatchManager } from '@/components/patch-manager'
import { ModuleLayer } from '@/components/rack/module-layer'
import { RackGridLayer } from '@/components/rack/rack-grid-layer'
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
import {
  availableModules,
  type ModuleInstance,
  type ModuleType,
} from '@/lib/module-registry'
import { cn } from '@/lib/utils'

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
  const { toast } = useToast()
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false)

  // Viewport/world for transform-based panning
  const WORLD_WIDTH = 10000
  const ROW_HEIGHT_PX = 520
  const NUM_ROWS = 16
  const WORLD_HEIGHT = NUM_ROWS * ROW_HEIGHT_PX + 16

  const getModuleHp = (type: ModuleType): number => {
    const entry = availableModules.find((m) => m.type === type)
    return entry?.hp ?? 9
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
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [currentPatch, updateCurrentPatch, toast])

  // Wheel disabled; only pan when space is held (still prevent native scroll)

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

  console.log('rack')

  return (
    <main className="h-screen bg-background flex flex-col relative">
      <Header openAddModuleDialog={() => setIsModuleDialogOpen(true)} />

      <RackDivider />

      <LayoutProvider rowHeightPx={ROW_HEIGHT_PX} numRows={NUM_ROWS}>
        <RacksWorld
          modules={modules}
          setModules={setModules}
          addModule={addModule}
          removeModule={removeModule}
          getModuleHp={(t: ModuleType) =>
            availableModules.find((m) => m.type === t)?.hp ?? 9
          }
          worldWidth={WORLD_WIDTH}
          worldHeight={WORLD_HEIGHT}
          onRemoveModule={handleDeleteModule}
        />
      </LayoutProvider>

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

const RackDivider = () => {
  return <div className="border-t border-white/20" />
}

// RacksWorld is defined below
function RacksWorld({
  modules,
  setModules,
  addModule,
  removeModule,
  getModuleHp,
  worldWidth,
  worldHeight,
  onRemoveModule,
}: {
  modules: ModuleInstance[]
  setModules: React.Dispatch<React.SetStateAction<ModuleInstance[]>>
  addModule: (type: ModuleType) => void
  removeModule: (moduleId: string) => void
  getModuleHp: (type: ModuleType) => number
  worldWidth: number
  worldHeight: number
  onRemoveModule: (moduleId: string) => void
}) {
  const { registerViewport, registerWorld, setScaleRef } = useLayout()

  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const cameraRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const pendingApplyRef = useRef(false)
  const isSpaceHeldRef = useRef(false)
  const [isSpaceHeld, setIsSpaceHeld] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)
  const cameraStartRef = useRef<{ x: number; y: number } | null>(null)
  const scaleRef = useRef<number>(1)
  const [_scale, _setScale] = useState<number>(1)

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
      const oneMinusOverS = (1 - s) / s
      const minX =
        (viewportWidth - s * worldWidth - (1 - s) * (viewportWidth / 2)) / s
      const maxX = -oneMinusOverS * (viewportWidth / 2)
      const minY =
        (viewportHeight - s * worldHeight - (1 - s) * (viewportHeight / 2)) / s
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
    [worldWidth, worldHeight],
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

  useEffect(() => {
    setScaleRef(() => scaleRef.current)
  }, [setScaleRef])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        ['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)
      ) {
        return
      }
      if (event.code === 'Space') {
        if (!isSpaceHeldRef.current) {
          isSpaceHeldRef.current = true
          setIsSpaceHeld(true)
        }
        event.preventDefault()
        return
      }
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
  }, [setScale])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = e.deltaMode === 1 ? 16 : 1
      const dx = e.deltaX * s
      const dy = e.deltaY * s
      panBy(-dx, -dy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [panBy])

  const handleCommitPositions = useCallback(
    (updates: Array<{ id: string; rack: number; xHp: number }>) => {
      const map = new Map<string, { rack: number; xHp: number }>()
      for (const u of updates) map.set(u.id, { rack: u.rack, xHp: u.xHp })
      setModules((prev) =>
        prev.map((m) => {
          const u = map.get(m.id)
          if (!u) return m
          return { ...m, rack: u.rack, xHp: u.xHp }
        }),
      )
    },
    [setModules],
  )

  return (
    <div
      id="racks"
      ref={(el) => {
        viewportRef.current = el
        if (el) registerViewport(el)
      }}
      className="flex-1 relative bg-black overflow-hidden overscroll-none"
    >
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

      <div
        id="racks-world"
        ref={(el) => {
          worldRef.current = el
          if (el) registerWorld(el)
        }}
        className="absolute top-0 left-0"
        style={{
          width: worldWidth,
          height: worldHeight,
          willChange: 'transform',
        }}
      >
        <RackGridLayer numRows={16} rowHeightPx={520} />
        <ModuleLayer
          modules={modules}
          getHpForTypeAction={(t: string) => getModuleHp(t as ModuleType)}
          onCommitAction={handleCommitPositions}
          onRemoveModuleAction={onRemoveModule}
        />
        <WireCanvas />
      </div>
    </div>
  )
}
