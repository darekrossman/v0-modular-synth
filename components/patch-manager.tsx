import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { resetAudioContext } from '@/lib/helpers'
import { useConnections } from './connection-manager'

// -------- Types aligned with the new connection system --------
export interface PatchModule {
  id: string
  type: string
  parameters: Record<string, any>
  position?: {
    x: number
    y: number
  }
  rack?: number
}

export interface PatchConnection {
  id: string // uuid or any unique ID
  from: string // source port id (output)
  to: string // target port id (input)
  kind: 'audio' | 'cv'
  color?: string // wire color (optional for backward compatibility)
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

// Module registration callback types
type ModuleSaveCallback = () => Record<string, any>
type ModulePositionCallback = () => { x: number; y: number } | undefined

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
  registerModule: (
    moduleId: string,
    onSave: ModuleSaveCallback,
    onGetPosition?: ModulePositionCallback,
  ) => void
  unregisterModule: (moduleId: string) => void
  getInitialParameters: (moduleId: string) => Record<string, any> | undefined
}

const PatchContext = createContext<PatchContextType | null>(null)

export function usePatchManager() {
  const context = useContext(PatchContext)
  if (!context)
    throw new Error('usePatchManager must be used within PatchProvider')
  return context
}

// Hook for modules to register themselves and get initial parameters
export function useModulePatch(
  moduleId: string,
  onSave: ModuleSaveCallback,
  onGetPosition?: ModulePositionCallback,
) {
  const { registerModule, unregisterModule, getInitialParameters } =
    usePatchManager()

  // Get initial parameters (only once on mount)
  const [initialParameters] = useState(() => getInitialParameters(moduleId))

  // Register on mount, unregister on unmount
  useEffect(() => {
    registerModule(moduleId, onSave, onGetPosition)
    return () => unregisterModule(moduleId)
  }, [moduleId, onSave, onGetPosition, registerModule, unregisterModule])

  return { initialParameters }
}

const createDefaultPatch = (): Patch => ({
  name: 'example patch',
  version: '2.0',
  modules: [
    {
      id: 'keyboard-cv-1',
      type: 'keyboard-cv',
      parameters: {},
      rack: 1,
    },
    {
      id: 'oscillator-1',
      type: 'oscillator',
      parameters: {
        tune: 0,
        octave: -2,
        phase: 0,
        waveType: 'sawtooth',
        pulseWidth: 0.5,
        syncAmount: 0,
        waveformMorph: 0,
        fmAmount: 0,
        pwmCvAmt: 1,
        morphCvAmt: 1,
      },
      rack: 1,
    },
    {
      id: 'lowpass-filter-1',
      type: 'lowpass-filter',
      parameters: {
        cutoff: 0.3090909090909094,
        resonance: 0.6409090909090897,
        cvAttenuation: 1,
        resCvAttenuation: 1,
      },
      rack: 1,
    },
    {
      id: 'adsr-1',
      type: 'adsr',
      parameters: {
        attackN: 0,
        decayN: 0.4,
        sustainN: 0,
        releaseN: 0.393,
        maxVN: 1,
        retrig: true,
        longMode: false,
        linearShape: false,
      },
      rack: 1,
    },
    {
      id: 'adsr-2',
      type: 'adsr',
      parameters: {
        attackN: 0,
        decayN: 0.09954977488744372,
        sustainN: 1,
        releaseN: 0.431,
        maxVN: 1,
        retrig: true,
        longMode: false,
        linearShape: false,
      },
      rack: 1,
    },
    {
      id: 'vca-1',
      type: 'vca',
      parameters: {
        cvAmount: 1,
        offset: 0,
      },
      rack: 1,
    },
    {
      id: 'output-1',
      type: 'output',
      parameters: {
        volume: 0.75,
      },
      rack: 1,
    },
  ],
  connections: [
    {
      id: '1059bf35-5382-46d6-b32b-066cec1ac0a7',
      from: 'keyboard-cv-1-pitch-out',
      to: 'oscillator-1-freq-in',
      kind: 'cv',
      color: '#00FF94',
    },
    {
      id: '66d188df-7f96-4651-a79c-21ea14039f6a',
      from: 'keyboard-cv-1-gate-out',
      to: 'adsr-1-gate-in',
      kind: 'cv',
      color: '#FF8000',
    },
    {
      id: '39d09eef-3966-4539-a370-b66f3be8982b',
      from: 'keyboard-cv-1-gate-out',
      to: 'adsr-2-gate-in',
      kind: 'cv',
      color: '#FF8000',
    },
    {
      id: 'cbc8800c-20a3-4c74-8a5d-69ed38cef2f4',
      from: 'oscillator-1-audio-out',
      to: 'lowpass-filter-1-audio-in',
      kind: 'audio',
      color: '#0057ff',
    },
    {
      id: 'f677966c-a42d-423a-b96b-d4f2aa2929a4',
      from: 'lowpass-filter-1-audio-out',
      to: 'vca-1-audio-in',
      kind: 'audio',
      color: '#00FF94',
    },
    {
      id: 'a0fb733b-e506-43db-a975-6bcee54be6c3',
      from: 'vca-1-audio-out',
      to: 'output-1-left-in',
      kind: 'audio',
      color: '#ff33ef',
    },
    {
      id: '1022e942-f58c-4d92-85e3-707bf9b5ca5e',
      from: 'vca-1-audio-out',
      to: 'output-1-right-in',
      kind: 'audio',
      color: '#ff33ef',
    },
    {
      id: 'b5bd9ac4-bea7-4d3b-8861-fd6d9b1e15e0',
      from: 'adsr-1-env-out',
      to: 'lowpass-filter-1-cutoff-cv-in',
      kind: 'cv',
      color: '#FF0040',
    },
    {
      id: '70726a50-9e8b-4fa7-86e6-12578d41ee78',
      from: 'adsr-2-env-out',
      to: 'vca-1-cv-in',
      kind: 'cv',
      color: '#0057ff',
    },
  ],
  metadata: {
    created: '2024-01-01T00:00:00.000Z',
    modified: '2025-09-07T21:17:21.506Z',
    description:
      'The default synthesizer configuration with dual ADSR envelopes - one for amplitude and one for filter modulation',
  },
})

interface PatchProviderProps {
  children: ReactNode
  modules: Array<{ id: string; type: string; rack?: number }>
  onModulesChange: (
    modules: Array<{ id: string; type: string; rack?: number }>,
  ) => void
  onParameterChange: (moduleId: string, parameter: string, value: any) => void
}

const STORAGE_KEY = 'synthesizer-patches'

// --------- Persistence helpers (with legacy normalization) ----------
const normalizeConnections = (conns: any[]): PatchConnection[] => {
  if (!Array.isArray(conns)) return []
  return conns.map((c) => {
    // legacy -> new
    if (c?.sourcePortId && c.targetPortId && c.audioType) {
      return {
        id: c.id || c.uuid || `${c.sourcePortId}->${c.targetPortId}`,
        from: c.sourcePortId,
        to: c.targetPortId,
        kind: c.audioType,
        ...(c.color && { color: c.color }),
      }
    }
    // already new - preserve color if it exists
    return {
      id: c.id,
      from: c.from,
      to: c.to,
      kind: c.kind,
      ...(c.color && { color: c.color }),
    }
  })
}

const normalizePatch = (p: any): Patch | null => {
  if (!p || typeof p !== 'object') return null
  if (!Array.isArray(p.modules) || !Array.isArray(p.connections)) return null
  return {
    name: p.name || 'Untitled Patch',
    version: p.version || '2.0',
    modules: p.modules.map((m: any) => ({
      id: m.id,
      type: m.type,
      parameters: m.parameters || {},
      ...(m.position && { position: m.position }),
      ...(m.x !== undefined &&
        m.y !== undefined && { position: { x: m.x, y: m.y } }),
      ...(m.rack !== undefined && { rack: m.rack }),
    })),
    connections: normalizeConnections(p.connections),
    metadata: p.metadata || {},
  }
}

const loadPatchesFromStorage = (): Patch[] => {
  try {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    const raw = JSON.parse(stored)
    const patches = Array.isArray(raw)
      ? (raw.map(normalizePatch).filter(Boolean) as Patch[])
      : []
    return patches
  } catch {
    return []
  }
}

const savePatchesToStorage = (patches: Patch[]) => {
  try {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patches))
  } catch {}
}

// -------------------- Provider --------------------
export function PatchProvider({
  children,
  modules,
  onModulesChange,
  onParameterChange,
}: PatchProviderProps) {
  const [currentPatch, setCurrentPatch] = useState<Patch | null>(null)
  const [availablePatches, setAvailablePatches] = useState<Patch[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Module registry for save callbacks
  const moduleCallbacksRef = useRef<
    Map<
      string,
      {
        onSave: ModuleSaveCallback
        onGetPosition?: ModulePositionCallback
      }
    >
  >(new Map())

  // Temporary storage for initial parameters when loading a patch
  const initialParametersRef = useRef<Record<string, Record<string, any>>>({})

  // NEW connection APIs
  const {
    connections, // ConnectionEdge[] (id, from, to, kind)
    exportPatch: exportPatchJSON,
    loadPatch: loadPatchJSON,
    clearAllConnections,
    waitForPortsRegistered,
  } = useConnections()

  // Init: load storage + ensure default present
  useEffect(() => {
    if (isInitialized) return
    const stored = loadPatchesFromStorage()
    const defaultPatch = createDefaultPatch()
    const hasDefault = stored.some((p) => p.name === 'example patch')
    const all = hasDefault ? stored : [defaultPatch, ...stored]
    setAvailablePatches(all)
    setCurrentPatch(defaultPatch)
    setIsInitialized(true)
  }, [isInitialized])

  // Persist to localStorage when list changes
  useEffect(() => {
    if (isInitialized) savePatchesToStorage(availablePatches)
  }, [availablePatches, isInitialized])

  // Get current state by calling all registered module callbacks
  const getCurrentState = useCallback((): Patch => {
    // Build modules with parameters from registered callbacks
    const modulesForExport = modules.map((m) => {
      const callbacks = moduleCallbacksRef.current.get(m.id)
      const parameters = callbacks?.onSave() || {}
      const position = callbacks?.onGetPosition?.()

      return {
        id: m.id,
        type: m.type,
        parameters,
        ...(position && { position }),
        ...(m.rack && { rack: m.rack }),
      }
    })

    const { connections: edges } = exportPatchJSON(modulesForExport)
    return {
      name: currentPatch?.name || 'Untitled Patch',
      version: '2.0',
      modules: modulesForExport,
      connections: edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        kind: e.kind,
        ...(e.color && { color: e.color }),
      })),
      metadata: { modified: new Date().toISOString() },
    }
  }, [modules, currentPatch, exportPatchJSON])

  const savePatch = useCallback(
    (name: string, description?: string) => {
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
          const updated = [...prev]
          updated[idx] = patch
          return updated
        }
        return [...prev, patch]
      })
      setCurrentPatch(patch)
    },
    [getCurrentState],
  )

  const updateCurrentPatch = useCallback(() => {
    if (!currentPatch) return
    const updated = getCurrentState()
    updated.name = currentPatch.name
    updated.metadata = {
      ...currentPatch.metadata,
      modified: new Date().toISOString(),
    }

    setAvailablePatches((prev) => {
      const idx = prev.findIndex((p) => p.name === currentPatch.name)
      if (idx >= 0) {
        const cp = [...prev]
        cp[idx] = updated
        return cp
      }
      return prev
    })
    setCurrentPatch(updated)
  }, [currentPatch, getCurrentState])

  // Wait until all modules in the patch have mounted and registered
  const waitForModuleRegistration = useCallback(
    async (expectedModuleIds: string[], timeoutMs = 2000) => {
      const start = performance.now()
      return await new Promise<void>((resolve) => {
        const check = () => {
          const registeredIds = Array.from(moduleCallbacksRef.current.keys())
          const ready = expectedModuleIds.every((id) =>
            registeredIds.includes(id),
          )
          if (ready || performance.now() - start > timeoutMs) {
            // One extra frame ensures DOM refs (ports) are attached and measured
            requestAnimationFrame(() => resolve())
            return
          }
          requestAnimationFrame(check)
        }
        requestAnimationFrame(check)
      })
    },
    [],
  )

  const loadPatch = useCallback(
    async (patchLike: Patch) => {
      const patch = normalizePatch(patchLike) as Patch
      if (!patch) return

      // 1) Store initial parameters for modules to retrieve
      initialParametersRef.current = {}
      patch.modules.forEach((m) => {
        initialParametersRef.current[m.id] = m.parameters || {}
      })

      // 2) Tear down previous graph completely
      clearAllConnections()
      // Force unmount all modules before creating new graph
      onModulesChange([])
      // Destroy and reset the shared AudioContext so modules will create fresh nodes
      console.time('resetAudioContext')
      await resetAudioContext()
      console.timeEnd('resetAudioContext')

      // 3) Update modules list (will trigger re-render with new parameters)
      const moduleInstances = patch.modules.map((m) => ({
        id: m.id,
        type: m.type as any,
        ...(m.rack && { rack: m.rack }),
      }))
      onModulesChange(moduleInstances)

      // 4) Wait until modules have mounted and registered so ports exist in the DOM
      await waitForModuleRegistration(patch.modules.map((m) => m.id))
      // Also wait until all port Elements for the patch's connections are present
      const portIds = Array.from(
        new Set(patch.connections.flatMap((c) => [c.from, c.to])),
      )
      await waitForPortsRegistered(portIds)

      // 5) Load connections (ensure all have colors) on the next frame to let layout settle
      const connectionsWithColors = patch.connections.map((conn) => ({
        ...conn,
        color: conn.color || '#888888',
      }))
      requestAnimationFrame(() => {
        loadPatchJSON({
          modules: patch.modules,
          connections: connectionsWithColors,
        })
        setCurrentPatch(patch)
      })
    },
    [
      onModulesChange,
      loadPatchJSON,
      waitForModuleRegistration,
      clearAllConnections,
    ],
  )

  const exportPatch = useCallback(
    (patch: Patch): string => JSON.stringify(patch, null, 2),
    [],
  )

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
    if (patchName === 'Default Patch') return
    setAvailablePatches((prev) => prev.filter((p) => p.name !== patchName))
    setCurrentPatch((cp) => (cp?.name === patchName ? null : cp))
  }, [])

  const createNewPatch = useCallback(() => {
    // Clear connections at the graph level before changing modules
    clearAllConnections()

    const blank: Patch = {
      name: 'New Patch',
      version: '1.0',
      modules: [],
      connections: [],
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        description: 'A blank patch',
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

  // Register a module with its save callback
  const registerModule = useCallback(
    (
      moduleId: string,
      onSave: ModuleSaveCallback,
      onGetPosition?: ModulePositionCallback,
    ) => {
      moduleCallbacksRef.current.set(moduleId, { onSave, onGetPosition })
    },
    [],
  )

  // Unregister a module
  const unregisterModule = useCallback((moduleId: string) => {
    moduleCallbacksRef.current.delete(moduleId)
  }, [])

  // Get initial parameters for a module
  const getInitialParameters = useCallback(
    (moduleId: string): Record<string, any> | undefined => {
      return initialParametersRef.current[moduleId]
    },
    [],
  )

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
        registerModule,
        unregisterModule,
        getInitialParameters,
      }}
    >
      {children}
    </PatchContext.Provider>
  )
}
