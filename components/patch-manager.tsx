"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { useConnections } from "./connection-manager"

// -------- Types aligned with the new connection system --------
export interface PatchModule {
  id: string
  type: string
  parameters: Record<string, any>
  x?: number
  y?: number
}

export interface PatchConnection {
  id: string           // uuid or any unique ID
  from: string         // source port id (output)
  to: string           // target port id (input)
  kind: "audio" | "cv"
}

export interface Patch {
  name: string
  version: string
  modules: PatchModule[]
  connections: PatchConnection[]
  metadata?: {
    created?: string
    modified?: string
    description?: string
  }
}

interface PatchContextType {
  currentPatch: Patch | null
  availablePatches: Patch[]
  savePatch: (name: string, description?: string) => void
  updateCurrentPatch: () => void
  loadPatch: (patch: Patch) => void
  exportPatch: (patch: Patch) => string
  importPatch: (jsonString: string) => Patch | null
  deletePatch: (patchName: string) => void
  getCurrentState: () => Patch
  createNewPatch: () => void
  duplicatePatch: (patch: Patch, newName: string) => Patch
  loadDefaultPatch: () => void
}

const PatchContext = createContext<PatchContextType | null>(null)

export function usePatchManager() {
  const context = useContext(PatchContext)
  if (!context) throw new Error("usePatchManager must be used within PatchProvider")
  return context
}

// ---------- Default patch (uses new {from,to,kind} shape) ----------
const createDefaultPatch = (): Patch => ({
  name: "Default Patch",
  version: "2.0",
  modules: [
    { id: "keyboard-cv-1", type: "keyboard-cv", parameters: {} },
    { id: "oscillator-1", type: "oscillator", parameters: { tune: 0, octave: 0, phase: 0, waveType: "sine" } },
    { id: "lowpass-filter-1", type: "lowpass-filter", parameters: { cutoff: 1000, resonance: 1 } },
    { id: "adsr-2", type: "adsr", parameters: { attack: 0.05, decay: 0.1, sustain: 0.5, release: 1.0 } },
    { id: "adsr-1", type: "adsr", parameters: { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.3 } },
    { id: "lfo-1", type: "lfo", parameters: {} },
    { id: "vca-1", type: "vca", parameters: {} },
    { id: "output-1", type: "output", parameters: {} },
  ],
  connections: [
    { id: "c1", from: "keyboard-cv-1-gate-out", to: "adsr-1-gate-in", kind: "cv" },
    { id: "c2", from: "keyboard-cv-1-gate-out", to: "adsr-2-gate-in", kind: "cv" },
    { id: "c3", from: "keyboard-cv-1-pitch-out", to: "oscillator-1-freq-in", kind: "cv" },
    { id: "c4", from: "oscillator-1-audio-out", to: "lowpass-filter-1-audio-in-1", kind: "audio" },
    { id: "c5", from: "lowpass-filter-1-audio-out", to: "vca-1-audio-in", kind: "audio" },
    { id: "c6", from: "adsr-1-env-out", to: "vca-1-cv-in", kind: "cv" },
    { id: "c7", from: "adsr-2-env-out", to: "lowpass-filter-1-cutoff-cv-in", kind: "cv" },
    { id: "c8", from: "vca-1-audio-out", to: "output-1-left-in", kind: "audio" },
    { id: "c9", from: "vca-1-audio-out", to: "output-1-right-in", kind: "audio" },
  ],
  metadata: {
    created: "2024-01-01T00:00:00.000Z",
    modified: "2024-01-01T00:00:00.000Z",
    description:
      "The default synthesizer configuration with dual ADSR envelopes - one for amplitude and one for filter modulation",
  },
})

interface PatchProviderProps {
  children: ReactNode
  modules: Array<{ id: string; type: string }>
  onModulesChange: (modules: Array<{ id: string; type: string }>) => void
  onParameterChange: (moduleId: string, parameter: string, value: any) => void
}

const STORAGE_KEY = "synthesizer-patches"

// --------- Persistence helpers (with legacy normalization) ----------
const normalizeConnections = (conns: any[]): PatchConnection[] => {
  if (!Array.isArray(conns)) return []
  return conns.map((c) => {
    // legacy -> new
    if (c && c.sourcePortId && c.targetPortId && c.audioType) {
      return { id: c.id || c.uuid || `${c.sourcePortId}->${c.targetPortId}`, from: c.sourcePortId, to: c.targetPortId, kind: c.audioType }
    }
    // already new
    return { id: c.id, from: c.from, to: c.to, kind: c.kind }
  })
}

const normalizePatch = (p: any): Patch | null => {
  if (!p || typeof p !== "object") return null
  if (!Array.isArray(p.modules) || !Array.isArray(p.connections)) return null
  return {
    name: p.name || "Untitled Patch",
    version: p.version || "2.0",
    modules: p.modules.map((m: any) => ({
      id: m.id, type: m.type, parameters: m.parameters || {}, x: m.x, y: m.y,
    })),
    connections: normalizeConnections(p.connections),
    metadata: p.metadata || {},
  }
}

const loadPatchesFromStorage = (): Patch[] => {
  try {
    if (typeof window === "undefined") return []
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const raw = JSON.parse(stored)
    const patches = Array.isArray(raw) ? raw.map(normalizePatch).filter(Boolean) as Patch[] : []
    return patches
  } catch {
    return []
  }
}

const savePatchesToStorage = (patches: Patch[]) => {
  try {
    if (typeof window === "undefined") return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patches))
  } catch {}
}

// -------------------- Provider --------------------
export function PatchProvider({ children, modules, onModulesChange, onParameterChange }: PatchProviderProps) {
  const [currentPatch, setCurrentPatch] = useState<Patch | null>(null)
  const [availablePatches, setAvailablePatches] = useState<Patch[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // NEW connection APIs
  const {
    connections,               // ConnectionEdge[] (id, from, to, kind)
    exportPatch: exportPatchJSON,
    loadPatch: loadPatchJSON,
    clearAllConnections,
  } = useConnections()

  // Init: load storage + ensure default present
  useEffect(() => {
    if (isInitialized) return
    const stored = loadPatchesFromStorage()
    const defaultPatch = createDefaultPatch()
    const hasDefault = stored.some((p) => p.name === "Default Patch")
    const all = hasDefault ? stored : [defaultPatch, ...stored]
    setAvailablePatches(all)
    setCurrentPatch(defaultPatch)
    setIsInitialized(true)
  }, [isInitialized])

  // Persist to localStorage when list changes
  useEffect(() => {
    if (isInitialized) savePatchesToStorage(availablePatches)
  }, [availablePatches, isInitialized])

  // Capture UI parameters from DOM (kept from your original)
  const getCurrentState = useCallback((): Patch => {
    const moduleParameters: Record<string, Record<string, any>> = {}

    modules.forEach((module) => {
      const parameters: Record<string, any> = {}
      const moduleElement = document.querySelector(`[data-module-id="${module.id}"]`)

      if (moduleElement) {
        if ((moduleElement as any).getParameters) {
          Object.assign(parameters, (moduleElement as any).getParameters())
        } else {
          const sliders = moduleElement.querySelectorAll('input[type="range"]')
          sliders.forEach((slider) => {
            const input = slider as HTMLInputElement
            const paramName = input.getAttribute("data-param") || input.id
            if (paramName) parameters[paramName] = Number.parseFloat(input.value)
          })
          const selects = moduleElement.querySelectorAll("select")
          selects.forEach((select) => {
            const paramName = select.getAttribute("data-param") || select.id
            if (paramName) parameters[paramName] = (select as HTMLSelectElement).value
          })
          const buttonGroups: Record<string, string> = {}
          const buttons = moduleElement.querySelectorAll("button[data-param]")
          buttons.forEach((button) => {
            const paramName = button.getAttribute("data-param")
            const dataValue = button.getAttribute("data-value")
            if (paramName && dataValue) {
              const isSelected =
                button.classList.contains("bg-primary") ||
                button.getAttribute("data-state") === "on" ||
                button.getAttribute("aria-pressed") === "true" ||
                !button.classList.contains("border-input")
              if (isSelected) buttonGroups[paramName] = dataValue
            }
          })
          Object.assign(parameters, buttonGroups)
        }
      }

      moduleParameters[module.id] = parameters
    })

    // Build modules (with parameters) for the provider’s export
    const modulesForExport = modules.map((m) => ({
      id: m.id, type: m.type, parameters: moduleParameters[m.id] || {},
    }))

    const { connections: edges } = exportPatchJSON(modulesForExport)
    return {
      name: currentPatch?.name || "Untitled Patch",
      version: "2.0",
      modules: modulesForExport,
      connections: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, kind: e.kind })),
      metadata: { modified: new Date().toISOString() },
    }
  }, [modules, currentPatch, exportPatchJSON])

  const savePatch = useCallback((name: string, description?: string) => {
    const patch = getCurrentState()
    patch.name = name
    patch.metadata = {
      ...patch.metadata,
      created: patch.metadata?.created || new Date().toISOString(),
      modified: new Date().toISOString(),
      description,
    }

    setAvailablePatches((prev) => {
      const idx = prev.findIndex((p) => p.name === name)
      if (idx >= 0) {
        const updated = [...prev]; updated[idx] = patch; return updated
      }
      return [...prev, patch]
    })
    setCurrentPatch(patch)
  }, [getCurrentState])

  const updateCurrentPatch = useCallback(() => {
    if (!currentPatch) return
    const updated = getCurrentState()
    updated.name = currentPatch.name
    updated.metadata = { ...currentPatch.metadata, modified: new Date().toISOString() }

    setAvailablePatches((prev) => {
      const idx = prev.findIndex((p) => p.name === currentPatch.name)
      if (idx >= 0) { const cp = [...prev]; cp[idx] = updated; return cp }
      return prev
    })
    setCurrentPatch(updated)
  }, [currentPatch, getCurrentState])

  const restoreModuleParameters = useCallback((patch: Patch) => {
    patch.modules.forEach((module) => {
      const moduleElement = document.querySelector(`[data-module-id="${module.id}"]`)
      if (!moduleElement) return

      if ((moduleElement as any).setParameters) {
        ;(moduleElement as any).setParameters(module.parameters)
      } else {
        Object.entries(module.parameters).forEach(([param, value]) => {
          const selectors = [
            `[data-param="${param}"]`,
            `#${param}`,
            `input[name="${param}"]`,
            `select[name="${param}"]`,
            `button[data-param="${param}"][data-value="${value}"]`,
            `button[data-param="${param}"]`,
          ]
          let input: HTMLElement | null = null
          for (const sel of selectors) { input = moduleElement.querySelector(sel); if (input) break }
          if (!input) return

          if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
            input.value = String(value)
            input.dispatchEvent(new Event("change", { bubbles: true }))
            input.dispatchEvent(new Event("input", { bubbles: true }))
          } else if (input instanceof HTMLButtonElement) {
            const val = input.getAttribute("data-value")
            if (val === String(value)) input.click()
            else {
              const correct = moduleElement.querySelector(`button[data-param="${param}"][data-value="${value}"]`)
              if (correct instanceof HTMLButtonElement) correct.click()
            }
          }
          // Notify app-level handler too
          onParameterChange(module.id, param, value)
        })
      }
    })
  }, [onParameterChange])

  const loadPatch = useCallback((patchLike: Patch) => {
    const patch = normalizePatch(patchLike) as Patch
    if (!patch) return

    // 1) update modules list (render first)
    const moduleInstances = patch.modules.map((m) => ({ id: m.id, type: m.type as any }))
    onModulesChange(moduleInstances)

    // 2) restore params after render tick
    requestAnimationFrame(() => restoreModuleParameters(patch))

    // 3) hand connections to the provider (auto-binds as ports/nodes register)
    loadPatchJSON({ modules: patch.modules, connections: patch.connections })
    setCurrentPatch(patch)
  }, [onModulesChange, restoreModuleParameters, loadPatchJSON])

  const exportPatch = useCallback((patch: Patch): string => JSON.stringify(patch, null, 2), [])

  const importPatch = useCallback((jsonString: string): Patch | null => {
    try {
      const raw = JSON.parse(jsonString)
      const norm = normalizePatch(raw)
      if (!norm) return null
      return norm
    } catch {
      return null
    }
  }, [])

  const deletePatch = useCallback((patchName: string) => {
    if (patchName === "Default Patch") return
    setAvailablePatches((prev) => prev.filter((p) => p.name !== patchName))
    setCurrentPatch((cp) => (cp?.name === patchName ? null : cp))
  }, [])

  const createNewPatch = useCallback(() => {
    clearAllConnections()
    const blankModules = [{ id: "output-1", type: "output" }]
    onModulesChange(blankModules)

    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-module-id="output-1"]`)
      if (el && (el as any).setParameters) (el as any).setParameters({})
    })

    const blank: Patch = {
      name: "New Patch",
      version: "2.0",
      modules: [{ id: "output-1", type: "output", parameters: {} }],
      connections: [],
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        description: "A blank patch with only an output module",
      },
    }
    setCurrentPatch(blank)
  }, [clearAllConnections, onModulesChange])

  const loadDefaultPatch = useCallback(() => {
    loadPatch(createDefaultPatch())
  }, [loadPatch])

  const duplicatePatch = useCallback((patch: Patch, newName: string) => {
    const dup: Patch = {
      ...patch,
      name: newName,
      metadata: {
        ...patch.metadata,
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        description: `Copy of ${patch.name}`,
      },
    }
    setAvailablePatches((prev) => [...prev, dup])
    return dup
  }, [])

  return (
    <PatchContext.Provider
      value={{
        currentPatch,
        availablePatches,
        savePatch,
        updateCurrentPatch,
        loadPatch,
        exportPatch,
        importPatch,
        deletePatch,
        getCurrentState,
        createNewPatch,
        duplicatePatch,
        loadDefaultPatch,
      }}
    >
      {children}
    </PatchContext.Provider>
  )
}
