"use client"

import React, { useState, useEffect } from "react"
import * as motion from "motion/react"
const { Reorder, useDragControls } = motion
import { OscillatorModule } from "@/components/oscillator-module"
import { LFOModule } from "@/components/lfo-module"
import { OutputModule } from "@/components/output-module"
import { LowPassFilterModule } from "@/components/lowpass-filter-module"
import { KeyboardCVModule } from "@/components/keyboard-cv-module"
import { ADSRModule } from "@/components/adsr-module"
import { VCAModule } from "@/components/vca-module"
import { RandomModule } from "@/components/random-module"
import { ClockModule } from "@/components/clock-module"
import { SimpleOscilloscopeModule } from "@/components/simple-oscilloscope-module"
import { SequencerModule } from "@/components/sequencer-module"
import { DelayModule } from "@/components/delay-module"
import { QuantizerModule } from "@/components/quantizer-module"

import { ConnectionProvider, useConnections } from "@/components/connection-manager"
import { WireCanvas } from "@/components/wire-canvas"

import { PatchProvider, usePatchManager } from "@/components/patch-manager"
import { PatchDropdown } from "@/components/patch-dropdown"

import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Plus, Trash2, Settings as SettingsIcon } from "lucide-react"
import { SettingsProvider, useSettings } from "@/components/settings-context"
import { SettingsDialog } from "@/components/settings-dialog"

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
  | "simple-oscilloscope"
  | "clock"
  | "sequencer"
  | "random"
  | "quantizer"

interface ModuleInstance {
  id: string
  type: ModuleType
  rack?: number
  order?: number
}

const availableModules = [
  { type: "oscillator" as ModuleType, name: "Oscillator", description: "Audio frequency generator" },
  { type: "output" as ModuleType, name: "Output", description: "Stereo audio output" },
  { type: "lowpass-filter" as ModuleType, name: "Lowpass Filter", description: "Frequency filter" },
  { type: "keyboard-cv" as ModuleType, name: "Keyboard CV", description: "MIDI keyboard to CV converter" },
  { type: "adsr" as ModuleType, name: "ADSR", description: "Attack Decay Sustain Release envelope" },
  { type: "vca" as ModuleType, name: "VCA", description: "Voltage controlled amplifier" },
  { type: "random" as ModuleType, name: "Random", description: "Random voltage generator" },
  { type: "clock" as ModuleType, name: "Clock", description: "Timing and trigger generator" },
  { type: "simple-oscilloscope" as ModuleType, name: "Scope", description: "Single-channel oscilloscope" },
  { type: "sequencer" as ModuleType, name: "Sequencer", description: "Step sequencer for patterns" },
  { type: "lfo" as ModuleType, name: "LFO", description: "Low-frequency oscillator" },
  { type: "delay" as ModuleType, name: "Delay", description: "Delay effect module" },
  { type: "quantizer" as ModuleType, name: "Quantizer", description: "Pitch CV quantizer" },
]

interface SynthPlaygroundContentProps {
  modules: ModuleInstance[]
  setModules: React.Dispatch<React.SetStateAction<ModuleInstance[]>>
  addModule: (type: ModuleType) => void
  removeModule: (moduleId: string) => void
}

// Wrapper component for each draggable module
function DraggableModuleItem({ module, index, rackModules, children }: any) {
  const controls = useDragControls()
  
  return (
    <Reorder.Item 
      key={module.id} 
      value={module}
      dragControls={controls}
      dragListener={false}
      whileDrag={{ zIndex: 1 }}
      transition={{ duration: 0.15 }}
      className="relative h-full"
      style={{ marginRight: index < rackModules.length - 1 ? '0.25rem' : 0 }}
    >
      <div 
        className="h-full"
        onPointerDown={(e) => {
          // Only start drag if clicking on the header area
          const target = e.target as HTMLElement
          const header = target.closest('.module-header')
          if (header) {
            controls.start(e)
          }
        }}
      >
        {children}
      </div>
    </Reorder.Item>
  )
}

function SynthPlaygroundContent({ modules, setModules, addModule, removeModule }: SynthPlaygroundContentProps) {
  const { loadDefaultPatch } = usePatchManager()
  const { connections, removeConnection } = useConnections()
  const { open } = useSettings()

  useEffect(() => {
    //loadDefaultPatch()
  }, [loadDefaultPatch])

  const handleDeleteModule = (moduleId: string) => {
    connections.forEach((connection) => {
      if (connection.from.startsWith(moduleId) || connection.to.startsWith(moduleId)) {
        removeConnection(connection.id)
      }
    })

    removeModule(moduleId)
  }

  const renderModule = (module: ModuleInstance, index: number, rackModules: ModuleInstance[]) => {
    const key = module.id
    const ModuleComponent = (() => {
      switch (module.type) {
        case "oscillator":
          return <OscillatorModule key={key} moduleId={module.id} />
        case "lfo":
          return <LFOModule key={key} moduleId={module.id} />
        case "output":
          return <OutputModule key={key} moduleId={module.id} />
        case "lowpass-filter":
          return <LowPassFilterModule key={key} moduleId={module.id} />
        case "keyboard-cv":
          return <KeyboardCVModule key={key} moduleId={module.id} />
        case "adsr":
          return <ADSRModule key={key} moduleId={module.id} />
        case "vca":
          return <VCAModule key={key} moduleId={module.id} />
        case "random":
          return <RandomModule key={key} moduleId={module.id} />
        case "clock":
          return <ClockModule key={key} moduleId={module.id} />
        case "simple-oscilloscope":
          return <SimpleOscilloscopeModule key={key} moduleId={module.id} />
        case "sequencer":
          return <SequencerModule key={key} moduleId={module.id} />
        case "delay":
          return <DelayModule key={key} moduleId={module.id} />
        case "quantizer":
          return <QuantizerModule key={key} moduleId={module.id} />
        default:
          return null
      }
    })()

    return (
      <div key={key} className="relative h-full">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="h-full">{ModuleComponent}</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem
              variant="destructive"
              onClick={() => handleDeleteModule(module.id)}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>
    )
  }

  // Rack assignment: Sequencer and Quantizer always in rack 2
  const rack1Modules = modules.filter(
    (m: ModuleInstance) => (m.rack === 1 || !m.rack) && m.type !== "sequencer" && m.type !== "quantizer"
  )
  const rack2Modules = modules.filter(
    (m: ModuleInstance) => m.rack === 2 || m.type === "sequencer" || m.type === "quantizer"
  )

  return (
    <main className="h-screen bg-background flex flex-col relative">
      <WireCanvas />

      <header className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Synthesis Playground</h1>
          <p className="text-sm text-muted-foreground">Modular synthesis environment</p>
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
        <div className="p-1 border-b border-border h-[550px] bg-neutral-900">
          <Reorder.Group 
            axis="x" 
            values={rack1Modules}
            onReorder={(newOrder) => {
              setModules(prev => {
                const rack2 = prev.filter(m => m.rack === 2 || m.type === "sequencer" || m.type === "quantizer")
                return [...newOrder, ...rack2]
              })
              // Trigger geometry update for wires
              setTimeout(() => {
                window.dispatchEvent(new Event('resize'))
              }, 0)
            }}
            className="flex overflow-x-auto relative items-stretch h-full"
          >
            {rack1Modules.map((module: ModuleInstance, index: number) => (
              <DraggableModuleItem
                key={module.id}
                module={module}
                index={index}
                rackModules={rack1Modules}
              >
                {renderModule(module, index, rack1Modules)}
              </DraggableModuleItem>
            ))}
          </Reorder.Group>
        </div>

        <div className="p-1 border-b border-border min-h-64 bg-neutral-900">
          <Reorder.Group 
            axis="x" 
            values={rack2Modules}
            onReorder={(newOrder) => {
              setModules(prev => {
                const rack1 = prev.filter(m => (m.rack === 1 || !m.rack) && m.type !== "sequencer" && m.type !== "quantizer")
                return [...rack1, ...newOrder]
              })
              // Trigger geometry update for wires
              setTimeout(() => {
                window.dispatchEvent(new Event('resize'))
              }, 0)
            }}
            className="flex overflow-x-auto relative items-stretch h-full"
          >
            {rack2Modules.map((module: ModuleInstance, index: number) => (
              <DraggableModuleItem
                key={module.id}
                module={module}
                index={index}
                rackModules={rack2Modules}
              >
                {renderModule(module, index, rack2Modules)}
              </DraggableModuleItem>
            ))}
          </Reorder.Group>
        </div>

        <div className="flex-1 p-4 flex items-center justify-center text-muted-foreground min-h-16">
          <p>Additional workspace area</p>
        </div>
      </div>
    </main>
  )
}

export default function SynthPlayground() {
  const [modules, setModules] = useState<ModuleInstance[]>([])

  const addModule = (type: ModuleType) => {
    const existingCount = modules.filter((m) => m.type === type).length
    const newId = `${type}-${existingCount + 1}`
    const rack = (type === "sequencer" || type === "quantizer") ? 2 : 1
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
          onModulesChange={(m: Array<{ id: string; type: string }>) =>
            setModules(
              m.map((x) => ({
                id: x.id,
                type: x.type as ModuleType,
                rack: (x.type === "sequencer" || x.type === "quantizer") ? 2 : 1,
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
