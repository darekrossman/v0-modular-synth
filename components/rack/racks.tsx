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

  const rack1Ref = useRef<HTMLDivElement>(null)
  const rack2Ref = useRef<HTMLDivElement>(null)
  const rack3Ref = useRef<HTMLDivElement>(null)

  // Viewport/world for transform-based panning
  const WORLD_SIZE = 10000
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

  const applyTransform = useCallback(() => {
    pendingApplyRef.current = false
    const el = worldRef.current
    if (!el) return
    const { x, y } = cameraRef.current
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  }, [])

  const scheduleApply = useCallback(() => {
    if (pendingApplyRef.current) return
    pendingApplyRef.current = true
    rafRef.current = requestAnimationFrame(applyTransform)
  }, [applyTransform])

  const panBy = useCallback(
    (dx: number, dy: number) => {
      const nx = Math.min(0, cameraRef.current.x + dx)
      const ny = Math.min(0, cameraRef.current.y + dy)
      cameraRef.current = { x: nx, y: ny }
      scheduleApply()
    },
    [scheduleApply],
  )

  useEffect(() => {
    // setTimeout(() => {
    //   loadDefaultPatch()
    // }, 1000)
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
      addModule(moduleType)
    },
    [addModule],
  )

  const rack1Modules = useMemo(
    () =>
      modules.filter(
        (m: ModuleInstance) =>
          m.rack === 1 ||
          (!m.rack &&
            m.type !== 'sequencer' &&
            m.type !== 'quantizer' &&
            m.type !== 'euclid'),
      ),
    [modules],
  )
  const rack2Modules = useMemo(
    () => modules.filter((m: ModuleInstance) => m.rack === 2),
    [modules],
  )
  const rack3Modules = useMemo(
    () =>
      modules.filter(
        (m: ModuleInstance) =>
          m.rack === 3 ||
          m.type === 'sequencer' ||
          m.type === 'quantizer' ||
          m.type === 'euclid',
      ),
    [modules],
  )

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
      const rackEl =
        rack === 1
          ? rack1Ref.current
          : rack === 2
            ? rack2Ref.current
            : rack3Ref.current
      if (!rackEl) return
      const rackModules =
        rack === 1 ? rack1Modules : rack === 2 ? rack2Modules : rack3Modules
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
    [dragState, rack1Modules, rack2Modules, rack3Modules],
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
      if (rack === dragState.draggedFromRack) {
        const sourceRackModules =
          rack === 1 ? rack1Modules : rack === 2 ? rack2Modules : rack3Modules
        const draggedIndex = sourceRackModules.findIndex(
          (m) => m.id === draggedModule.id,
        )
        if (draggedIndex !== -1 && dropIndex > draggedIndex) {
          dropIndex--
        }
      }
      const modulesWithoutDragged = modules.filter(
        (m) => m.id !== draggedModule.id,
      )
      const rack1Filtered = modulesWithoutDragged.filter(
        (m) =>
          m.rack === 1 ||
          (!m.rack &&
            m.type !== 'sequencer' &&
            m.type !== 'quantizer' &&
            m.type !== 'euclid'),
      )
      const rack2Filtered = modulesWithoutDragged.filter((m) => m.rack === 2)
      const rack3Filtered = modulesWithoutDragged.filter(
        (m) =>
          m.rack === 3 ||
          m.type === 'sequencer' ||
          m.type === 'quantizer' ||
          m.type === 'euclid',
      )
      if (rack === 1) {
        rack1Filtered.splice(dropIndex, 0, { ...draggedModule, rack: 1 })
        setModules([...rack1Filtered, ...rack2Filtered, ...rack3Filtered])
      } else if (rack === 2) {
        rack2Filtered.splice(dropIndex, 0, { ...draggedModule, rack: 2 })
        setModules([...rack1Filtered, ...rack2Filtered, ...rack3Filtered])
      } else {
        rack3Filtered.splice(dropIndex, 0, { ...draggedModule, rack: 3 })
        setModules([...rack1Filtered, ...rack2Filtered, ...rack3Filtered])
      }
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
    [dragState, rack1Modules, rack2Modules, rack3Modules, modules, setModules],
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
              const nx = Math.min(0, cameraStartRef.current.x + dx)
              const ny = Math.min(0, cameraStartRef.current.y + dy)
              cameraRef.current = { x: nx, y: ny }
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
            width: WORLD_SIZE,
            height: WORLD_SIZE,
            willChange: 'transform',
          }}
        >
          {/* WireCanvas now moves with the world */}
          <WireCanvas />

          <RackRow>
            <div
              ref={rack1Ref}
              className="flex relative items-stretch h-full z-1"
              onDragOver={(e) => handleDragOver(e, 1)}
              onDrop={(e) => handleDrop(e, 1)}
              onDragEnd={handleDragEnd}
            >
              {/* Left spacer removed; world has fixed size */}
              {rack1Modules.map((module: ModuleInstance, index: number) => (
                <React.Fragment key={module.id}>
                  {dragState.isDragging &&
                    dragState.dropRack === 1 &&
                    dragState.dropIndex === index && <DragIndicator />}
                  <DraggableModuleItem
                    module={module}
                    index={index}
                    rackModules={rack1Modules}
                    onDelete={handleDeleteModule}
                    onDragStart={(e: React.DragEvent) =>
                      handleDragStart(e, module, 1)
                    }
                    isDragging={dragState.isDragging}
                    draggedId={dragState.draggedModule?.id}
                  />
                </React.Fragment>
              ))}
              {dragState.isDragging &&
                dragState.dropRack === 1 &&
                dragState.dropIndex === rack1Modules.length && (
                  <DragIndicator />
                )}
              {/* Right spacer removed; world has fixed size */}
            </div>
          </RackRow>

          <RackDivider />

          <RackRow size="1U">
            <div
              ref={rack3Ref}
              className="flex relative items-stretch h-full z-1"
              onDragOver={(e) => handleDragOver(e, 3)}
              onDrop={(e) => handleDrop(e, 3)}
              onDragEnd={handleDragEnd}
            >
              {/* Left spacer removed */}
              {rack3Modules.map((module: ModuleInstance, index: number) => (
                <React.Fragment key={module.id}>
                  {dragState.isDragging &&
                    dragState.dropRack === 3 &&
                    dragState.dropIndex === index && <DragIndicator />}
                  <DraggableModuleItem
                    module={module}
                    index={index}
                    rackModules={rack3Modules}
                    onDelete={handleDeleteModule}
                    onDragStart={(e: React.DragEvent) =>
                      handleDragStart(e, module, 3)
                    }
                    isDragging={dragState.isDragging}
                    draggedId={dragState.draggedModule?.id}
                  />
                </React.Fragment>
              ))}
              {dragState.isDragging &&
                dragState.dropRack === 3 &&
                dragState.dropIndex === rack3Modules.length && (
                  <DragIndicator />
                )}
              {/* Right spacer removed */}
            </div>
          </RackRow>

          <RackDivider />

          <RackRow>
            <div
              ref={rack2Ref}
              className="flex relative items-stretch h-full z-1"
              onDragOver={(e) => handleDragOver(e, 2)}
              onDrop={(e) => handleDrop(e, 2)}
              onDragEnd={handleDragEnd}
            >
              {/* Left spacer removed */}
              {rack2Modules.map((module: ModuleInstance, index: number) => (
                <React.Fragment key={module.id}>
                  {dragState.isDragging &&
                    dragState.dropRack === 2 &&
                    dragState.dropIndex === index && <DragIndicator />}
                  <DraggableModuleItem
                    module={module}
                    index={index}
                    rackModules={rack2Modules}
                    onDelete={handleDeleteModule}
                    onDragStart={(e: React.DragEvent) =>
                      handleDragStart(e, module, 2)
                    }
                    isDragging={dragState.isDragging}
                    draggedId={dragState.draggedModule?.id}
                  />
                </React.Fragment>
              ))}
              {dragState.isDragging &&
                dragState.dropRack === 2 &&
                dragState.dropIndex === rack2Modules.length && (
                  <DragIndicator />
                )}
              {/* Right spacer removed */}
            </div>
          </RackRow>
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

const RackRow = ({
  size = '3U',
  children,
}: {
  size?: '3U' | '1U'
  children: React.ReactNode
}) => {
  return (
    <div
      className={cn(
        'relative w-full bg-gradient-to-b from-rack-background/80 to-rack-background/85',
        {
          'h-[520px]': size === '3U',
          'h-[200px]': size === '1U',
        },
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
