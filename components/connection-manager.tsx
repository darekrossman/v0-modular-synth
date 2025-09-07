'use client'

import type React from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { v4 as uuid } from 'uuid'
import type {
  AudioKind,
  ConnectionEdge,
  PatchJson,
  PortDirection,
} from '@/lib/connection-types'

// Re-export for components that import from here
export type { AudioKind, ConnectionEdge, PatchJson }

// Keep local alias for backward compatibility
type Direction = PortDirection

// ---- Utils
const WIRE_PALETTE = [
  '#FF0040', // Vibrant red/pink
  '#0057ff', // Vibrant blue
  '#4db500', // Vibrant green
  '#00FF94', // Vibrant mint green
  '#FF8000', // Vibrant orange
  '#9D00FF', // Vibrant purple
  '#ff33ef', // Vibrant pink
]
const GRAY_WIRE = '#808080'

const getRandomPaletteColor = () => {
  return WIRE_PALETTE[Math.floor(Math.random() * WIRE_PALETTE.length)]
}

const safeConnect = (outNode?: AudioNode, inNode?: AudioNode) => {
  if (!outNode || !inNode) return false
  try {
    ;(outNode as any).connect(inNode)
    return true
  } catch {
    return false
  }
}
const safeDisconnect = (outNode?: AudioNode, inNode?: AudioNode) => {
  if (!outNode || !inNode) return false
  try {
    ;(outNode as any).disconnect(inNode)
    return true
  } catch {
    return false
  }
}

// ---- Port registry
type PortEntry = {
  el?: Element
  meta: { direction: Direction; kind: AudioKind; moduleId?: string }
  audioNode?: AudioNode
}
type PortsMap = Map<string, PortEntry>
type Geometry = { x: number; y: number }

// ---- Context API
interface Ctx {
  connections: ConnectionEdge[]
  geometryVersion: number // <- bump whenever port centers change

  // Drag
  beginDrag: (fromPortId: string, clientX: number, clientY: number) => void
  updateDrag: (clientX: number, clientY: number) => void
  endDrag: (maybeToPortId?: string) => void
  cancelDrag: () => void

  // Manage connections
  addConnection: (
    fromPortId: string,
    toPortId: string,
    kind: Exclude<AudioKind, 'any'>,
    color?: string,
  ) => void
  removeConnection: (id: string) => void
  clearAllConnections: () => void
  removeAllConnectionsForModule: (moduleId: string) => void // Added function to remove all connections for a specific module

  // Registration
  registerPort: (
    portId: string,
    info: {
      el: Element | null
      direction: Direction
      kind: AudioKind
      moduleId?: string
    },
  ) => void
  unregisterPort: (portId: string) => void
  registerAudioNode: (
    portId: string,
    node: AudioNode,
    direction: Direction,
  ) => void

  // Styling/geometry
  getPortColor: (portId: string) => string
  getConnectedWireColor: (portId: string) => string | null // Get color of wire connected to this port
  getDragColor: (portId: string) => string | null // Get temp color if this port is being dragged from
  registerTempWireUpdater: (
    fn: (
      from: { x: number; y: number },
      to: { x: number; y: number } | null,
      color?: string,
    ) => void,
  ) => void
  getPortCenter: (portId: string) => { x: number; y: number }

  // Readiness helpers
  waitForPortsRegistered: (
    portIds: string[],
    timeoutMs?: number,
  ) => Promise<void>

  // Save/Load
  exportPatch: (modules: PatchJson['modules']) => PatchJson
  loadPatch: (patch: PatchJson) => void
}

const Ctx = createContext<Ctx | null>(null)
export const useConnections = () => {
  const v = useContext(Ctx)
  if (!v)
    throw new Error('useConnections must be used inside ConnectionProvider')
  return v
}

export function ConnectionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // Registries
  const ports = useRef<PortsMap>(new Map())
  const portCenters = useRef<Map<string, Geometry>>(new Map())
  const needsMeasure = useRef(false)

  const connectionsRef = useRef<Map<string, ConnectionEdge>>(new Map())
  const [connections, setConnections] = useState<ConnectionEdge[]>([])

  // Version to trigger overlay re-render when geometry changes
  const [geometryVersion, setGeometryVersion] = useState(0)
  // Track active drag for port color updates
  const [activeDrag, setActiveDrag] = useState<{
    from: string
    color: string
  } | null>(null)

  // Drag state
  const dragging = useRef<{
    active: boolean
    from?: string
    fromDirection?: Direction
    tempColor?: string
    pt?: { x: number; y: number }
  }>({ active: false })

  // Temp wire updater (imperative)
  const tempWireUpdater = useRef<
    | null
    | ((
        from: { x: number; y: number },
        to: { x: number; y: number } | null,
        color?: string,
      ) => void)
  >(null)

  const registerTempWireUpdater = useCallback(
    (
      fn: (
        from: { x: number; y: number },
        to: { x: number; y: number } | null,
        color?: string,
      ) => void,
    ) => {
      tempWireUpdater.current = fn
    },
    [],
  )

  const getPortCenter = useCallback((portId: string) => {
    return portCenters.current.get(portId) ?? { x: 0, y: 0 }
  }, [])

  const waitForPortsRegistered = useCallback(
    async (portIds: string[], timeoutMs: number = 2000) => {
      const start = performance.now()
      return await new Promise<void>((resolve) => {
        const check = () => {
          const allPresent = portIds.every((id) => {
            const entry = ports.current.get(id)
            return !!(entry && entry.el)
          })
          if (allPresent || performance.now() - start > timeoutMs) {
            // Wait one extra frame to allow measurement loop to compute centers
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

  // Geometry measurement (runs at most once per frame)
  const measureOnce = useCallback(() => {
    needsMeasure.current = false
    let changed = false
    ports.current.forEach((entry, portId) => {
      if (!entry.el) return
      const r = entry.el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const prev = portCenters.current.get(portId)
      if (!prev || prev.x !== cx || prev.y !== cy) {
        portCenters.current.set(portId, { x: cx, y: cy })
        changed = true
      }
    })
    if (changed) setGeometryVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      if (needsMeasure.current) measureOnce()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onScroll = () => {
      needsMeasure.current = true
    }
    const onResize = () => {
      needsMeasure.current = true
    }

    window.addEventListener('scroll', onScroll, {
      capture: true,
      passive: true,
    })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll as any, true)
      window.removeEventListener('resize', onResize as any)
    }
  }, [measureOnce])

  // Shared ResizeObserver (created on client after mount)
  const roRef = useRef<ResizeObserver | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof ResizeObserver === 'undefined') return
    roRef.current = new ResizeObserver(() => {
      needsMeasure.current = true
    })
    return () => {
      roRef.current?.disconnect()
      roRef.current = null
    }
  }, [])

  // ---- Registration ----
  const registerPort: Ctx['registerPort'] = useCallback((portId, info) => {
    const { el, direction, kind, moduleId } = info

    // Disconnect previous element if replaced
    const prev = ports.current.get(portId)
    if (prev?.el && el && prev.el !== el) {
      try {
        roRef.current?.unobserve(prev.el)
      } catch {}
    }

    // Update / create entry
    const entry: PortEntry = {
      el: el && el instanceof Element ? el : prev?.el,
      meta: { direction, kind, moduleId },
      audioNode: prev?.audioNode,
    }
    ports.current.set(portId, entry)

    if (el && el instanceof Element) {
      try {
        roRef.current?.observe(el)
      } catch (e) {
        console.error('[connection-manager] observe failed:', e)
      }
    }

    // Request measurement & bump version (so overlay updates even if measurement yields same coords)
    needsMeasure.current = true
    setGeometryVersion((v) => v + 1)
  }, [])

  const unregisterPort: Ctx['unregisterPort'] = useCallback((portId) => {
    const entry = ports.current.get(portId)
    if (entry?.el) {
      try {
        roRef.current?.unobserve(entry.el)
      } catch {}
    }
    ports.current.delete(portId)
    portCenters.current.delete(portId)
    needsMeasure.current = true
    setGeometryVersion((v) => v + 1)
  }, [])

  const registerAudioNode: Ctx['registerAudioNode'] = useCallback(
    (portId, node, direction) => {
      const prev = ports.current.get(portId)
      const kind: AudioKind = /cv|gate|trig/i.test(portId) ? 'cv' : 'audio'

      const entry: PortEntry = prev
        ? {
            ...prev,
            audioNode: node,
            meta: { ...prev.meta, direction: direction ?? prev.meta.direction },
          }
        : { el: undefined, audioNode: node, meta: { direction, kind } }

      ports.current.set(portId, entry)

      // Bind any edges that touch this port
      connectionsRef.current.forEach((edge) => {
        if (edge.from === portId || edge.to === portId) tryBind(edge)
      })
    },
    [],
  )

  // ---- Connections helpers ----
  const portsCompatible = (
    from?: PortEntry,
    to?: PortEntry,
    kind?: Exclude<AudioKind, 'any'>,
  ): from is PortEntry & { audioNode: AudioNode } => {
    if (!from || !to) return false
    if (from.meta.direction !== 'output' || to.meta.direction !== 'input')
      return false
    const k: Exclude<AudioKind, 'any'> =
      kind ??
      (from.meta.kind === 'cv' || to.meta.kind === 'cv' ? 'cv' : 'audio')
    const outOk = from.meta.kind === k || from.meta.kind === 'any'
    const inOk = to.meta.kind === k || to.meta.kind === 'any'
    return !!(outOk && inOk)
  }

  const tryBind = (edge: ConnectionEdge) => {
    const A = ports.current.get(edge.from)
    const B = ports.current.get(edge.to)
    if (!portsCompatible(A, B, edge.kind)) return false
    return safeConnect(A?.audioNode, B?.audioNode)
  }

  const tryUnbind = (edge: ConnectionEdge) => {
    const A = ports.current.get(edge.from)
    const B = ports.current.get(edge.to)
    return safeDisconnect(A?.audioNode, B?.audioNode)
  }

  const findConnectionIntoInput = (
    portId: string,
  ): { id: string; edge: ConnectionEdge } | null => {
    for (const [id, e] of connectionsRef.current) {
      if (e.to === portId) return { id, edge: e }
    }
    return null
  }

  // ---- Public connection API ----
  const addConnection: Ctx['addConnection'] = useCallback(
    (fromId, toId, kind, color) => {
      // De-dupe identical edge
      for (const e of connectionsRef.current.values()) {
        if (e.from === fromId && e.to === toId && e.kind === kind) return
      }

      const removedConnections: string[] = []
      for (const [id, e] of connectionsRef.current) {
        if (e.to === toId) {
          tryUnbind(e)
          connectionsRef.current.delete(id)
          removedConnections.push(id)
        }
      }

      // Determine color: use provided color, or get from existing output connections, or pick random
      let wireColor = color
      if (!wireColor) {
        // Check if output port already has connections
        const outputConnections = Array.from(
          connectionsRef.current.values(),
        ).filter((e) => e.from === fromId)
        if (outputConnections.length > 0) {
          wireColor = outputConnections[0].color
        } else {
          wireColor = getRandomPaletteColor()
        }
      }

      // Add the new connection
      const id = uuid()
      const edge: ConnectionEdge = {
        id,
        from: fromId,
        to: toId,
        kind,
        color: wireColor,
      }
      connectionsRef.current.set(id, edge)

      setConnections(Array.from(connectionsRef.current.values()))

      // Ensure geometry is fresh for both ends before/after drawing
      needsMeasure.current = true
      setGeometryVersion((v) => v + 1)

      tryBind(edge)
    },
    [],
  )

  const removeConnection: Ctx['removeConnection'] = useCallback((id) => {
    const edge = connectionsRef.current.get(id)
    if (!edge) return
    tryUnbind(edge)
    connectionsRef.current.delete(id)
    setConnections((xs) => xs.filter((c) => c.id !== id))
    setGeometryVersion((v) => v + 1)
  }, [])

  const clearAllConnections: Ctx['clearAllConnections'] = useCallback(() => {
    connectionsRef.current.forEach(tryUnbind)
    connectionsRef.current.clear()
    setConnections([])
    setGeometryVersion((v) => v + 1)
  }, [])

  const removeAllConnectionsForModule = useCallback((moduleId: string) => {
    const connectionsToRemove: string[] = []

    connectionsRef.current.forEach((edge, id) => {
      if (edge.from.startsWith(moduleId) || edge.to.startsWith(moduleId)) {
        connectionsToRemove.push(id)
      }
    })

    connectionsToRemove.forEach((id) => {
      const edge = connectionsRef.current.get(id)
      if (edge) {
        tryUnbind(edge)
        connectionsRef.current.delete(id)
      }
    })

    setConnections(Array.from(connectionsRef.current.values()))
    setGeometryVersion((v) => v + 1)
  }, [])

  // ---- Drag API ----
  const beginDrag: Ctx['beginDrag'] = useCallback(
    (fromPortId, clientX, clientY) => {
      needsMeasure.current = true

      const startEntry = ports.current.get(fromPortId)
      if (!startEntry) {
        dragging.current = {
          active: true,
          from: fromPortId,
          pt: { x: clientX, y: clientY },
        }
        return
      }

      // Dragging from a connected input → detach and start from the source output with existing color
      if (startEntry.meta.direction === 'input') {
        const hit = findConnectionIntoInput(fromPortId)
        if (hit) {
          const { id, edge } = hit
          tryUnbind(edge)
          connectionsRef.current.delete(id)
          setConnections((xs) => xs.filter((c) => c.id !== id))

          dragging.current = {
            active: true,
            from: edge.from,
            fromDirection: 'output',
            tempColor: edge.color, // Use existing wire color
            pt: { x: clientX, y: clientY },
          }
          // Set active drag state with existing color
          setActiveDrag({ from: edge.from, color: edge.color })

          const fromCenter = portCenters.current.get(edge.from)
          if (fromCenter && tempWireUpdater.current) {
            tempWireUpdater.current(
              fromCenter,
              { x: clientX, y: clientY },
              edge.color,
            )
          }
          setGeometryVersion((v) => v + 1)
          return
        }

        // Dragging from unconnected input - use gray for temp wire
        dragging.current = {
          active: true,
          from: fromPortId,
          fromDirection: 'input',
          tempColor: GRAY_WIRE,
          pt: { x: clientX, y: clientY },
        }
        // Set active drag state for input port (gray)
        setActiveDrag({ from: fromPortId, color: GRAY_WIRE })
      } else {
        // Dragging from output port
        // Check if output has existing connections to inherit color
        const existingConnections = Array.from(
          connectionsRef.current.values(),
        ).filter((e) => e.from === fromPortId)
        const tempColor =
          existingConnections.length > 0
            ? existingConnections[0].color
            : getRandomPaletteColor() // Pick new random color for unconnected output

        dragging.current = {
          active: true,
          from: fromPortId,
          fromDirection: 'output',
          tempColor,
          pt: { x: clientX, y: clientY },
        }

        // Set active drag state to trigger port color update
        setActiveDrag({ from: fromPortId, color: tempColor })
      }

      const fromCenter = portCenters.current.get(fromPortId)
      if (fromCenter && tempWireUpdater.current) {
        tempWireUpdater.current(
          fromCenter,
          { x: clientX, y: clientY },
          dragging.current.tempColor,
        )
      }
    },
    [],
  )

  const updateDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragging.current.active || !dragging.current.from) return
    dragging.current.pt = { x: clientX, y: clientY }
    const from = portCenters.current.get(dragging.current.from)
    if (from && tempWireUpdater.current)
      tempWireUpdater.current(
        from,
        { x: clientX, y: clientY },
        dragging.current.tempColor,
      )
  }, [])

  const endDrag = useCallback(
    (maybeToPortId?: string) => {
      const from = dragging.current.from
      const fromDirection = dragging.current.fromDirection
      const tempColor = dragging.current.tempColor
      dragging.current = { active: false } as any
      setActiveDrag(null) // Clear active drag state

      // Always clear temp wire
      tempWireUpdater.current?.({ x: 0, y: 0 }, null)

      if (!from || !maybeToPortId) return // dropped on empty space

      const fromPort = ports.current.get(from)
      const toPort = ports.current.get(maybeToPortId)
      if (!fromPort || !toPort) return

      // Support bidirectional dragging
      let outputPortId: string
      let inputPortId: string
      let finalColor: string | undefined = tempColor

      if (fromDirection === 'output') {
        // Dragging from output to input (normal)
        if (toPort.meta.direction !== 'input') return
        outputPortId = from
        inputPortId = maybeToPortId
      } else {
        // Dragging from input to output (reverse)
        if (toPort.meta.direction !== 'output') return
        outputPortId = maybeToPortId
        inputPortId = from

        // When connecting to an output, check if it has existing connections
        const existingOutputConnections = Array.from(
          connectionsRef.current.values(),
        ).filter((e) => e.from === outputPortId)
        if (existingOutputConnections.length > 0) {
          // Use existing output color
          finalColor = existingOutputConnections[0].color
        } else if (tempColor === GRAY_WIRE) {
          // Pick new random color since we were dragging from unconnected input
          finalColor = getRandomPaletteColor()
        }
      }

      const outPort = ports.current.get(outputPortId)
      const inPort = ports.current.get(inputPortId)
      if (!outPort || !inPort) return

      const desired: Exclude<AudioKind, 'any'> =
        outPort.meta.kind === 'cv' || inPort.meta.kind === 'cv' ? 'cv' : 'audio'

      const outOk = outPort.meta.kind === desired || outPort.meta.kind === 'any'
      const inOk = inPort.meta.kind === desired || inPort.meta.kind === 'any'
      if (!outOk || !inOk) return

      addConnection(outputPortId, inputPortId, desired, finalColor)
    },
    [addConnection],
  )

  const cancelDrag = useCallback(() => {
    dragging.current = { active: false } as any
    setActiveDrag(null) // Clear active drag state
    tempWireUpdater.current?.({ x: 0, y: 0 }, null)
  }, [])

  // ---- Save / Load ----
  const exportPatch: Ctx['exportPatch'] = useCallback(
    (modules) => ({
      modules,
      connections: Array.from(connectionsRef.current.values()),
    }),
    [],
  )

  const loadPatch: Ctx['loadPatch'] = useCallback(
    (patch) => {
      clearAllConnections()
      connectionsRef.current.clear()

      // Group connections by output port to assign consistent colors
      const outputGroups = new Map<string, string>()

      patch.connections.forEach((edge) => {
        const id = edge.id || uuid()

        // If edge doesn't have a color, assign one based on output port
        let color = edge.color
        if (!color) {
          if (outputGroups.has(edge.from)) {
            color = outputGroups.get(edge.from) || ''
          } else {
            color = getRandomPaletteColor()
            outputGroups.set(edge.from, color)
          }
        } else {
          // Track the color for this output port
          outputGroups.set(edge.from, color)
        }

        connectionsRef.current.set(id, { ...edge, id, color })
      })
      setConnections(Array.from(connectionsRef.current.values()))
      // Try immediate binds
      connectionsRef.current.forEach(tryBind)
      setGeometryVersion((v) => v + 1)
    },
    [clearAllConnections],
  )

  const value: Ctx = useMemo(
    () => ({
      connections,
      geometryVersion,

      beginDrag,
      updateDrag,
      endDrag,
      cancelDrag,

      addConnection,
      removeConnection,
      clearAllConnections,
      removeAllConnectionsForModule, // Added removeAllConnectionsForModule to context value

      registerPort,
      unregisterPort,
      registerAudioNode,

      getPortColor: (portId) => {
        // Deprecated - not used anymore
        return ''
      },
      getConnectedWireColor: (portId) => {
        // Find any connection that involves this port and return its color
        for (const edge of connections) {
          if (edge.from === portId || edge.to === portId) {
            return edge.color
          }
        }
        return null // No connection found
      },
      getDragColor: (portId) => {
        // Return temp color if this port is being dragged from
        if (activeDrag && activeDrag.from === portId) {
          return activeDrag.color
        }
        return null
      },
      registerTempWireUpdater,
      getPortCenter,
      waitForPortsRegistered,

      exportPatch,
      loadPatch,
    }),
    [
      connections,
      geometryVersion,
      activeDrag,
      beginDrag,
      updateDrag,
      endDrag,
      cancelDrag,
      addConnection,
      removeConnection,
      clearAllConnections,
      removeAllConnectionsForModule,
      registerPort,
      unregisterPort,
      registerAudioNode,
      registerTempWireUpdater,
      getPortCenter,
      exportPatch,
      loadPatch,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
