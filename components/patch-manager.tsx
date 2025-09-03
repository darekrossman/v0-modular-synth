import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
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
      id: 'clock-1',
      type: 'clock',
      parameters: {},
    },
    {
      id: 'random-1',
      type: 'random',
      parameters: {
        atten: [[1], [1], [1], [1], [1], [1]],
        offset: [[0.5], [0.5], [0.5], [0.5], [0.5], [0.5]],
      },
    },
    {
      id: 'lfo-1',
      type: 'lfo',
      parameters: {
        shape: 0,
        freq: 15.000250000000001,
        pw: 0.5,
        amp: 1,
        offset: 0,
        slew: 0,
        rateAmt: 4,
        pwAmt: 1,
        ampAmt: 2,
        offAmt: 2,
      },
    },
    {
      id: 'oscillator-1',
      type: 'oscillator',
      parameters: {
        tune: 0,
        octave: 0,
        phase: 0,
        waveType: 'square',
        pulseWidth: 0.5,
        syncAmount: 0,
        waveformMorph: 0,
        fmAmount: 0,
        pwmCvAmt: 1,
        morphCvAmt: 1,
      },
    },
    {
      id: 'oscillator-2',
      type: 'oscillator',
      parameters: {
        tune: 0,
        octave: 0,
        phase: 0,
        waveType: 'square',
        pulseWidth: 0.5,
        syncAmount: 0,
        waveformMorph: 0,
        fmAmount: 0,
        pwmCvAmt: 1,
        morphCvAmt: 1,
      },
    },
    {
      id: 'lowpass-filter-1',
      type: 'lowpass-filter',
      parameters: {
        cutoff: 1,
        resonance: 0,
        drive: 0,
        resComp: 0.6,
        fbSat: 0.09,
        input1Level: 1,
        input2Level: 1,
        input3Level: 1,
        cvAttenuation: 1,
      },
    },
    {
      id: 'adsr-1',
      type: 'adsr',
      parameters: {
        attackN: 0,
        decayN: 0.09954977488744372,
        sustainN: 1,
        releaseN: 0.019803960792158435,
        maxVN: 1,
        retrig: true,
        longMode: false,
        linearShape: false,
      },
    },
    {
      id: 'adsr-2',
      type: 'adsr',
      parameters: {
        attackN: 0,
        decayN: 0.09954977488744372,
        sustainN: 1,
        releaseN: 0.019803960792158435,
        maxVN: 1,
        retrig: true,
        longMode: false,
        linearShape: false,
      },
    },
    {
      id: 'vca-1',
      type: 'vca',
      parameters: {
        cvAmount: 1,
        offset: 0,
      },
    },
    {
      id: 'delay-1',
      type: 'delay',
      parameters: {
        time: 0.25999999999999995,
        feedback: 0.3,
        mix: 0,
        toneHz: 8000,
        mode: 0,
        timeCvAmt: 1,
        fbCvAmt: 1,
        clocked: false,
      },
    },
    {
      id: 'reverb-1',
      type: 'reverb',
      parameters: {
        size: 0.6,
        decay: 0.7,
        dampHz: 7400,
        preDelay: 0.08,
        mix: 0.35,
        algo: 1,
        sizeCvAmt: 1,
        dampCvAmt: 1,
        decayCvAmt: 1,
        mixCvAmt: 1,
      },
    },
    {
      id: 'output-1',
      type: 'output',
      parameters: {
        volume: 0.75,
      },
    },
    {
      id: 'euclid-1',
      type: 'euclid',
      parameters: {
        steps: 0.5,
        pulsesNorm: 0.375,
        rotateNorm: 0,
        gateRatio: 0.25,
        density: 1,
        accent: 0.5,
      },
    },
    {
      id: 'quantizer-1',
      type: 'quantizer',
      parameters: {
        scaleId: 'major',
        keyIdx: 0,
        hold: false,
        transpose: 0,
        octave: 0,
        mask12: 2741,
      },
    },
  ],
  connections: [
    {
      id: '1f92c6c1-80a6-400a-87dc-6c83eb057cc9',
      from: 'oscillator-1-audio-out',
      to: 'lowpass-filter-1-audio-in-1',
      kind: 'audio',
      color: '#FFD700',
    },
    {
      id: 'a6af7e1c-b4f9-42e4-927e-7bdfb32ee754',
      from: 'oscillator-2-audio-out',
      to: 'lowpass-filter-1-audio-in-2',
      kind: 'audio',
      color: '#FFD700',
    },
    {
      id: '667c8866-0563-4fba-96b6-c2fabb24cbce',
      from: 'lowpass-filter-1-audio-out',
      to: 'vca-1-audio-in',
      kind: 'audio',
      color: '#9D00FF',
    },
    {
      id: '767481eb-56b3-479b-8e1c-dca66f44c8b1',
      from: 'vca-1-audio-out',
      to: 'delay-1-in-l',
      kind: 'audio',
      color: '#FF0040',
    },
    {
      id: 'b25595fa-aa38-4f31-b5a6-b72fabf4b831',
      from: 'delay-1-out-l',
      to: 'reverb-1-in-l',
      kind: 'audio',
      color: '#FFD700',
    },
    {
      id: '438a30ae-8810-44a4-854c-8ba1348ea0dd',
      from: 'delay-1-out-r',
      to: 'reverb-1-in-r',
      kind: 'audio',
      color: '#9D00FF',
    },
    {
      id: '327f1bfa-e6fa-4155-9386-f2ad6894d4d7',
      from: 'reverb-1-out-l',
      to: 'output-1-left-in',
      kind: 'audio',
      color: '#00FF94',
    },
    {
      id: 'c5834340-baeb-4fff-8b43-312b0a79ce47',
      from: 'reverb-1-out-r',
      to: 'output-1-right-in',
      kind: 'audio',
      color: '#FF0040',
    },
    {
      id: 'd2e488ac-4d99-4749-b0d5-c9d5a1d6351f',
      from: 'adsr-2-env-out',
      to: 'vca-1-cv-in',
      kind: 'cv',
      color: '#FF8000',
    },
    {
      id: 'baca46f9-d29d-4f91-8fd2-6e96f6726a4e',
      from: 'adsr-1-env-out',
      to: 'lowpass-filter-1-cutoff-cv-in',
      kind: 'cv',
      color: '#00FF94',
    },
    {
      id: '9369b51f-4ded-4c8a-9a9e-f273274fc583',
      from: 'euclid-1-gate-out',
      to: 'adsr-2-gate-in',
      kind: 'cv',
      color: '#00FF94',
    },
    {
      id: '8f0760ca-075b-4138-8623-20809dc72105',
      from: 'euclid-1-accent-out',
      to: 'adsr-1-gate-in',
      kind: 'cv',
      color: '#FF0040',
    },
    {
      id: 'fe43dada-35d8-4af3-a781-5015b3d645fe',
      from: 'clock-1-48ppq-out',
      to: 'euclid-1-clock-in',
      kind: 'cv',
      color: '#FF0040',
    },
  ],
  metadata: {
    created: '2024-01-01T00:00:00.000Z',
    modified: '2025-09-01T20:38:12.454Z',
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

  const loadPatch = useCallback(
    (patchLike: Patch) => {
      const patch = normalizePatch(patchLike) as Patch
      if (!patch) return

      // 1) Store initial parameters for modules to retrieve
      initialParametersRef.current = {}
      patch.modules.forEach((m) => {
        initialParametersRef.current[m.id] = m.parameters || {}
      })

      // 2) Update modules list (will trigger re-render with new parameters)
      const moduleInstances = patch.modules.map((m) => ({
        id: m.id,
        type: m.type as any,
        ...(m.rack && { rack: m.rack }),
      }))
      onModulesChange(moduleInstances)

      // 3) Load connections (ensure all have colors)
      const connectionsWithColors = patch.connections.map((conn) => ({
        ...conn,
        color: conn.color || '#888888', // Default gray color if none specified
      }))
      loadPatchJSON({
        modules: patch.modules,
        connections: connectionsWithColors,
      })
      setCurrentPatch(patch)
    },
    [onModulesChange, loadPatchJSON],
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
