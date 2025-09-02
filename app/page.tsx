"use client"

import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from "react"
import { OscillatorModule } from "@/components/modules/oscillator-module"
import { LFOModule } from "@/components/modules/lfo-module"
import { OutputModule } from "@/components/modules/output-module"
import { LowPassFilterModule } from "@/components/modules/lowpass-filter-module"
import { KeyboardCVModule } from "@/components/modules/keyboard-cv-module"
import { ADSRModule } from "@/components/modules/adsr-module"
import { VCAModule } from "@/components/modules/vca-module"
import { RandomModule } from "@/components/modules/random-module"
import { ClockModule } from "@/components/modules/clock-module"
import { SimpleOscilloscopeModule } from "@/components/modules/simple-oscilloscope-module"
import { SequencerModule } from "@/components/modules/sequencer-module"
import { EuclidModule } from "@/components/modules/euclid-module"
import { DelayModule } from "@/components/modules/delay-module"
import { ReverbModule } from "@/components/modules/reverb-module"
import { QuantizerModule } from "@/components/modules/quantizer-module"

import { ConnectionProvider, useConnections } from "@/components/connection-manager"
import { WireCanvas } from "@/components/wire-canvas"

import { PatchProvider, usePatchManager } from "@/components/patch-manager"
import { PatchDropdown } from "@/components/patch-dropdown"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Plus, Trash2, Settings as SettingsIcon, X } from "lucide-react"
import { SettingsProvider, useSettings } from "@/components/settings-context"
import { SettingsDialog } from "@/components/settings-dialog"
import { useToast } from "@/hooks/use-toast"

type ModuleType =
  | "oscillator"
  | "lfo"
  | "vca"
  | "output"
  | "adsr"
  | "keyboard-cv"
  | "lowpass-filter"
  | "reverb"
  | "delay"
  | "oscilloscope"
  | "scope"
  | "clock"
  | "sequencer"
  | "random"
  | "quantizer"
  | "euclid"

interface ModuleInstance {
  id: string
  type: ModuleType
  rack?: number
  order?: number
}

const availableModules = [
  { type: "adsr" as ModuleType, name: "ADSR", description: "4-stage envelope generator" },
  { type: "clock" as ModuleType, name: "Clock", description: "Timing and trigger generator" },
  { type: "delay" as ModuleType, name: "Delay", description: "Delay effect module" },
  { type: "euclid" as ModuleType, name: "Euclid", description: "Euclidean rhythm sequencer" },
  { type: "keyboard-cv" as ModuleType, name: "Keyboard CV", description: "MIDI keyboard to CV converter" },
  { type: "lfo" as ModuleType, name: "LFO", description: "Low-frequency oscillator" },
  { type: "lowpass-filter" as ModuleType, name: "Lowpass Filter", description: "24db ladder filter" },
  { type: "oscillator" as ModuleType, name: "VCO", description: "Voltage-controlled oscillator" },
  { type: "output" as ModuleType, name: "Output", description: "Stereo audio output" },
  { type: "quantizer" as ModuleType, name: "Quantizer", description: "Pitch CV quantizer" },
  { type: "random" as ModuleType, name: "Random", description: "Random voltage generator" },
  { type: "reverb" as ModuleType, name: "Reverb", description: "Stereo reverb effect" },
  { type: "scope" as ModuleType, name: "Scope", description: "Single-channel oscilloscope" },
  { type: "sequencer" as ModuleType, name: "Sequencer", description: "Step sequencer for patterns" },
  { type: "vca" as ModuleType, name: "VCA", description: "Voltage-controlled amplifier" },
]

interface SynthPlaygroundContentProps {
  modules: ModuleInstance[]
  setModules: React.Dispatch<React.SetStateAction<ModuleInstance[]>>
  addModule: (type: ModuleType) => void
  removeModule: (moduleId: string) => void
}

// Memoized module renderer to prevent re-renders
const ModuleRenderer = memo(({ module }: { module: ModuleInstance }) => {
  switch (module.type) {
    case "oscillator":
      return <OscillatorModule moduleId={module.id} />
    case "lfo":
      return <LFOModule moduleId={module.id} />
    case "output":
      return <OutputModule moduleId={module.id} />
    case "lowpass-filter":
      return <LowPassFilterModule moduleId={module.id} />
    case "keyboard-cv":
      return <KeyboardCVModule moduleId={module.id} />
    case "adsr":
      return <ADSRModule moduleId={module.id} />
    case "vca":
      return <VCAModule moduleId={module.id} />
    case "random":
      return <RandomModule moduleId={module.id} />
    case "clock":
      return <ClockModule moduleId={module.id} />
    case "scope":
      return <SimpleOscilloscopeModule moduleId={module.id} />
    case "sequencer":
      return <SequencerModule moduleId={module.id} />
    case "euclid":
      return <EuclidModule moduleId={module.id} />
    case "delay":
      return <DelayModule moduleId={module.id} />
    case "reverb":
      return <ReverbModule moduleId={module.id} />
    case "quantizer":
      return <QuantizerModule moduleId={module.id} />
    default:
      return null
  }
})

ModuleRenderer.displayName = 'ModuleRenderer'

// Wrapper component for each draggable module
const DraggableModuleItem = memo(({ module, index, rackModules, onDelete, onDragStart, isDragging, draggedId }: any) => {
  const opacity = isDragging && draggedId === module.id ? 0.3 : 1
  const [isDraggable, setIsDraggable] = useState(false)

  return (
    <div
      key={module.id}
      className="relative h-full"
      style={{
        marginRight: index < rackModules.length - 1 ? '2px' : 0,
        opacity
      }}
      draggable={isDraggable}
      onDragStart={(e) => {
        if (isDraggable) {
          onDragStart(e, module, index)
        }
      }}
      onMouseDown={(e) => {
        // Check if clicking on module header
        const target = e.target as HTMLElement
        const header = target.closest('.module-header')
        setIsDraggable(!!header)
      }}
      onMouseUp={() => {
        setIsDraggable(false)
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="h-full">
            <ModuleRenderer module={module} />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            onClick={() => onDelete(module.id)}
            className="flex items-center gap-2"
          >
            <X className="w-3 h-3" />
            remove
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
})

DraggableModuleItem.displayName = 'DraggableModuleItem'

function SynthPlaygroundContent({ modules, setModules, addModule, removeModule }: SynthPlaygroundContentProps) {
  const { loadDefaultPatch, currentPatch, updateCurrentPatch } = usePatchManager()
  const { connections, removeConnection } = useConnections()
  const { open } = useSettings()
  const { toast } = useToast()
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false)

  // Drag state
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
    mouseX: 0
  })

  const rack1Ref = useRef<HTMLDivElement>(null)
  const rack2Ref = useRef<HTMLDivElement>(null)
  const rack3Ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // setTimeout(() => {
    //   loadDefaultPatch()
    // }, 1000)
  }, [])

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only trigger if not typing in an input/textarea
      if (['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)) {
        return
      }

      // Ctrl+S to save patch
      if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        if (currentPatch) {
          updateCurrentPatch()
          toast({
            title: "Patch saved",
            description: `"${currentPatch.name}" has been saved successfully.`,
          })
        }
        return
      }

      // M key to open module dialog
      if (event.key.toLowerCase() === 'm' &&
        !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        setIsModuleDialogOpen(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentPatch, updateCurrentPatch, toast])

  const handleDeleteModule = useCallback((moduleId: string) => {
    connections.forEach((connection) => {
      if (connection.from.startsWith(moduleId) || connection.to.startsWith(moduleId)) {
        removeConnection(connection.id)
      }
    })

    removeModule(moduleId)
  }, [connections, removeConnection, removeModule])

  const handleModuleSelect = useCallback((moduleType: ModuleType) => {
    addModule(moduleType)
  }, [addModule])

  // Rack assignment: rack 1 is general, rack 2 is new middle rack, rack 3 is for sequencers
  const rack1Modules = useMemo(() =>
    modules.filter(
      (m: ModuleInstance) => m.rack === 1 || (!m.rack && m.type !== "sequencer" && m.type !== "quantizer" && m.type !== "euclid")
    ),
    [modules]
  )

  const rack2Modules = useMemo(() =>
    modules.filter(
      (m: ModuleInstance) => m.rack === 2
    ),
    [modules]
  )

  const rack3Modules = useMemo(() =>
    modules.filter(
      (m: ModuleInstance) => m.rack === 3 || m.type === "sequencer" || m.type === "quantizer" || m.type === "euclid"
    ),
    [modules]
  )

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, module: ModuleInstance, fromRack: number) => {
    e.dataTransfer.effectAllowed = 'move'
    setDragState({
      isDragging: true,
      draggedModule: module,
      draggedFromRack: fromRack,
      dropIndex: null,
      dropRack: null,
      mouseX: e.clientX
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, rack: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'

    if (!dragState.isDragging || !dragState.draggedModule) return

    const rackEl = rack === 1 ? rack1Ref.current : rack === 2 ? rack2Ref.current : rack3Ref.current
    if (!rackEl) return

    const rackModules = rack === 1 ? rack1Modules : rack === 2 ? rack2Modules : rack3Modules
    const rackRect = rackEl.getBoundingClientRect()
    const relativeX = e.clientX - rackRect.left

    // Find drop index based on mouse position - simple approach
    let dropIdx = 0
    const moduleElements = rackEl.querySelectorAll('[draggable]')

    for (let i = 0; i < moduleElements.length; i++) {
      const moduleRect = moduleElements[i].getBoundingClientRect()
      const moduleMidpoint = moduleRect.left + moduleRect.width / 2 - rackRect.left

      if (relativeX > moduleMidpoint) {
        dropIdx = i + 1
      }
    }

    // Store the raw drop index - no adjustments
    setDragState(prev => ({ ...prev, dropIndex: dropIdx, dropRack: rack, mouseX: e.clientX }))
  }, [dragState, rack1Modules, rack2Modules, rack3Modules])

  const handleDrop = useCallback((e: React.DragEvent, rack: number) => {
    e.preventDefault()

    if (!dragState.isDragging || !dragState.draggedModule || dragState.dropIndex === null) return

    const draggedModule = dragState.draggedModule
    let dropIndex = dragState.dropIndex

    // When dragging within same rack, adjust drop index
    if (rack === dragState.draggedFromRack) {
      const sourceRackModules = rack === 1 ? rack1Modules : rack === 2 ? rack2Modules : rack3Modules
      const draggedIndex = sourceRackModules.findIndex(m => m.id === draggedModule.id)

      // If dropping after original position, decrement index since the module will be removed first
      if (draggedIndex !== -1 && dropIndex > draggedIndex) {
        dropIndex--
      }
    }

    // Create new array without the dragged module (from any rack)
    const modulesWithoutDragged = modules.filter(m => m.id !== draggedModule.id)

    // Find modules for each rack (excluding dragged)
    const rack1Filtered = modulesWithoutDragged.filter(m =>
      m.rack === 1 || (!m.rack && m.type !== "sequencer" && m.type !== "quantizer" && m.type !== "euclid")
    )
    const rack2Filtered = modulesWithoutDragged.filter(m => m.rack === 2)
    const rack3Filtered = modulesWithoutDragged.filter(m =>
      m.rack === 3 || m.type === "sequencer" || m.type === "quantizer" || m.type === "euclid"
    )

    // Insert dragged module at drop position in target rack
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

    // Reset drag state
    setDragState({
      isDragging: false,
      draggedModule: null,
      draggedFromRack: 1,
      dropIndex: null,
      dropRack: null,
      mouseX: 0
    })

    // Trigger geometry update for wires
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 50)
  }, [dragState, rack1Modules, rack2Modules, rack3Modules, modules, setModules])

  const handleDragEnd = useCallback(() => {
    setDragState({
      isDragging: false,
      draggedModule: null,
      draggedFromRack: 1,
      dropIndex: null,
      dropRack: null,
      mouseX: 0
    })
  }, [])

  return (
    <main className="h-screen bg-background flex flex-col relative">
      <WireCanvas />

      <header className="px-6 py-2 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">vrack</h1>
          <p className="text-sm text-muted-foreground">{currentPatch?.name || "empty patch"}</p>
        </div>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="bg-green-400 hover:bg-green-600">
                <Plus className="w-4 h-4 mr-2" />
                Module
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {availableModules.map((module) => (
                <DropdownMenuItem
                  key={module.type}
                  onClick={() => addModule(module.type)}
                  className="flex flex-col items-start gap-1 p-3"
                >
                  <div className="font-medium">{module.name}</div>
                  <div className="text-xs text-muted-foreground">{module.description}</div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <PatchDropdown />

          {/* Settings trigger (top-right header) */}
          <Button size="sm" variant="secondary" onClick={open} className="ml-2">
            <SettingsIcon className="w-4 h-4 mr-2" />
            Settings
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        <div className="p-1 border-b border-border h-[580px] bg-neutral-900">
          <div
            ref={rack1Ref}
            className="flex overflow-x-auto relative items-stretch h-full"
            onDragOver={(e) => handleDragOver(e, 1)}
            onDrop={(e) => handleDrop(e, 1)}
            onDragEnd={handleDragEnd}
          >
            {rack1Modules.map((module: ModuleInstance, index: number) => (
              <React.Fragment key={module.id}>
                {dragState.isDragging && dragState.dropRack === 1 && dragState.dropIndex === index && (
                  <DragIndicator />
                )}
                <DraggableModuleItem
                  module={module}
                  index={index}
                  rackModules={rack1Modules}
                  onDelete={handleDeleteModule}
                  onDragStart={(e: React.DragEvent) => handleDragStart(e, module, 1)}
                  isDragging={dragState.isDragging}
                  draggedId={dragState.draggedModule?.id}
                />
              </React.Fragment>
            ))}
            {dragState.isDragging && dragState.dropRack === 1 && dragState.dropIndex === rack1Modules.length && (
              <DragIndicator />
            )}
          </div>
        </div>

        <div className="p-1 border-b border-border h-[580px] bg-neutral-900">
          <div
            ref={rack2Ref}
            className="flex overflow-x-auto relative items-stretch h-full"
            onDragOver={(e) => handleDragOver(e, 2)}
            onDrop={(e) => handleDrop(e, 2)}
            onDragEnd={handleDragEnd}
          >
            {rack2Modules.map((module: ModuleInstance, index: number) => (
              <React.Fragment key={module.id}>
                {dragState.isDragging && dragState.dropRack === 2 && dragState.dropIndex === index && (
                  <DragIndicator />
                )}
                <DraggableModuleItem
                  module={module}
                  index={index}
                  rackModules={rack2Modules}
                  onDelete={handleDeleteModule}
                  onDragStart={(e: React.DragEvent) => handleDragStart(e, module, 2)}
                  isDragging={dragState.isDragging}
                  draggedId={dragState.draggedModule?.id}
                />
              </React.Fragment>
            ))}
            {dragState.isDragging && dragState.dropRack === 2 && dragState.dropIndex === rack2Modules.length && (
              <DragIndicator />
            )}
          </div>
        </div>

        <div className="p-1 border-b border-border h-[200px] bg-neutral-900">
          <div
            ref={rack3Ref}
            className="flex overflow-x-auto relative items-stretch h-full"
            onDragOver={(e) => handleDragOver(e, 3)}
            onDrop={(e) => handleDrop(e, 3)}
            onDragEnd={handleDragEnd}
          >
            {rack3Modules.map((module: ModuleInstance, index: number) => (
              <React.Fragment key={module.id}>
                {dragState.isDragging && dragState.dropRack === 3 && dragState.dropIndex === index && (
                  <DragIndicator />
                )}
                <DraggableModuleItem
                  module={module}
                  index={index}
                  rackModules={rack3Modules}
                  onDelete={handleDeleteModule}
                  onDragStart={(e: React.DragEvent) => handleDragStart(e, module, 3)}
                  isDragging={dragState.isDragging}
                  draggedId={dragState.draggedModule?.id}
                />
              </React.Fragment>
            ))}
            {dragState.isDragging && dragState.dropRack === 3 && dragState.dropIndex === rack3Modules.length && (
              <DragIndicator />
            )}
          </div>
        </div>

        <div className="flex-1 p-4 flex items-center justify-center text-muted-foreground min-h-16">
          <p>Additional workspace area</p>
        </div>
      </div>

      {/* Module Selection Dialog */}
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

export default function SynthPlayground() {
  const [modules, setModules] = useState<ModuleInstance[]>([])

  const addModule = (type: ModuleType) => {
    const existingCount = modules.filter((m) => m.type === type).length
    const newId = `${type}-${existingCount + 1}`
    const rack = (type === "sequencer" || type === "quantizer" || type === "euclid") ? 3 : 1
    setModules((prev) => [...prev, { id: newId, type, rack }])
  }

  const removeModule = (moduleId: string) => {
    setModules((prev) => prev.filter((m) => m.id !== moduleId))
  }

  const handleParameterChange = (moduleId: string, parameter: string, value: any) => {
    const moduleElement = document.querySelector(`[data-module-id="${moduleId}"]`)
    if (moduleElement && (moduleElement as any).setParameters) {
      ; (moduleElement as any).setParameters({ [parameter]: value })
    }
  }

  return (
    <SettingsProvider>
      <ConnectionProvider>
        <PatchProvider
          modules={modules}
          onModulesChange={(m: Array<{ id: string; type: string; rack?: number }>) =>
            setModules(
              m.map((x) => ({
                id: x.id,
                type: x.type as ModuleType,
                rack: x.rack !== undefined ? x.rack : (x.type === "sequencer" || x.type === "quantizer" || x.type === "euclid") ? 3 : 1,
              }))
            )}
          onParameterChange={handleParameterChange}
        >
          <SynthPlaygroundContent modules={modules} setModules={setModules} addModule={addModule} removeModule={removeModule} />
          <SettingsDialog />
        </PatchProvider>
      </ConnectionProvider>
    </SettingsProvider>
  )
}

const DragIndicator = () => (
  <div className="relative h-full flex-shrink-0">
    <div className="absolute top-0 left-[-2px] w-[4px] h-full bg-red-500 flex-shrink-0 z-10" />
  </div>
)