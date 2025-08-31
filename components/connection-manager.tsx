"use client"

import type React from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { v4 as uuid } from "uuid"

// ---- Minimal shared types (keep local to this file)
export type AudioKind = "audio" | "cv" | "any"
type Direction = "input" | "output"

export type ConnectionEdge = {
  id: string
  from: string
  to: string
  kind: Exclude<AudioKind, "any">
}

export type PatchJson = {
  modules: Array<{ id: string; type: string; parameters?: Record<string, any> }>
  connections: ConnectionEdge[]
}

// ---- Utils
const hashColor = (s: string) => {
  // Always return a palette color, even for empty strings
  const palette = ["#FF3B30", "#00D4AA", "#007AFF", "#34C759", "#FF9500", "#AF52DE", "#FFCC00"]
  
  if (!s || typeof s !== "string" || s.trim() === "") {
    // Return first palette color for empty strings instead of gray
    return palette[0]
  }

  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return palette[h % palette.length]
}

const safeConnect = (outNode?: AudioNode, inNode?: AudioNode) => {
  if (!outNode || !inNode) return false
  try {
    ; (outNode as any).connect(inNode)
    return true
  } catch {
    return false
  }
}
const safeDisconnect = (outNode?: AudioNode, inNode?: AudioNode) => {
  if (!outNode || !inNode) return false
  try {
    ; (outNode as any).disconnect(inNode)
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
  addConnection: (fromPortId: string, toPortId: string, kind: Exclude<AudioKind, "any">) => void
  removeConnection: (id: string) => void
  clearAllConnections: () => void
  removeAllConnectionsForModule: (moduleId: string) => void // Added function to remove all connections for a specific module

  // Registration
  registerPort: (
    portId: string,
    info: { el: Element | null; direction: Direction; kind: AudioKind; moduleId?: string },
  ) => void
  unregisterPort: (portId: string) => void
  registerAudioNode: (portId: string, node: AudioNode, direction: Direction) => void

  // Styling/geometry
  getPortColor: (portId: string) => string
  getConnectedWireColor: (portId: string) => string | null  // Get color of wire connected to this port
  registerTempWireUpdater: (fn: (from: { x: number; y: number }, to: { x: number; y: number } | null) => void) => void
  getPortCenter: (portId: string) => { x: number; y: number }

  // Save/Load
  exportPatch: (modules: PatchJson["modules"]) => PatchJson
  loadPatch: (patch: PatchJson) => void
}

const Ctx = createContext<Ctx | null>(null)
export const useConnections = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error("useConnections must be used inside ConnectionProvider")
  return v
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  // Registries
  const ports = useRef<PortsMap>(new Map())
  const portCenters = useRef<Map<string, Geometry>>(new Map())
  const needsMeasure = useRef(false)

  const connectionsRef = useRef<Map<string, ConnectionEdge>>(new Map())
  const [connections, setConnections] = useState<ConnectionEdge[]>([])

  // Version to trigger overlay re-render when geometry changes
  const [geometryVersion, setGeometryVersion] = useState(0)

  // Drag state
  const dragging = useRef<{ active: boolean; from?: string; pt?: { x: number; y: number } }>({ active: false })

  // Temp wire updater (imperative)
  const tempWireUpdater = useRef<
    null | ((from: { x: number; y: number }, to: { x: number; y: number } | null) => void)
  >(null)

  const registerTempWireUpdater = useCallback(
    (fn: (from: { x: number; y: number }, to: { x: number; y: number } | null) => void) => {
      tempWireUpdater.current = fn
    },
    [],
  )

  const getPortCenter = useCallback((portId: string) => {
    return portCenters.current.get(portId) ?? { x: 0, y: 0 }
  }, [])

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

    window.addEventListener("scroll", onScroll, { capture: true, passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("scroll", onScroll, true)
      window.removeEventListener("resize", onResize)
    }
  }, [measureOnce])

  // Shared ResizeObserver (created on client after mount)
  const roRef = useRef<ResizeObserver | null>(null)
  useEffect(() => {
    if (typeof window === "undefined") return
    if (typeof ResizeObserver === "undefined") return
    roRef.current = new ResizeObserver(() => {
      needsMeasure.current = true
    })
    return () => {
      roRef.current?.disconnect()
      roRef.current = null
    }
  }, [])

  // ---- Registration ----
  const registerPort: Ctx["registerPort"] = useCallback(
    (portId, info) => {
      const { el, direction, kind, moduleId } = info

      // Disconnect previous element if replaced
      const prev = ports.current.get(portId)
      if (prev?.el && el && prev.el !== el) {
        try {
          roRef.current?.unobserve(prev.el)
        } catch { }
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
          console.error("[connection-manager] observe failed:", e)
        }
      }

      // Request measurement & bump version (so overlay updates even if measurement yields same coords)
      needsMeasure.current = true
      setGeometryVersion((v) => v + 1)
    },
    [],
  )

  const unregisterPort: Ctx["unregisterPort"] = useCallback(
    (portId) => {
      const entry = ports.current.get(portId)
      if (entry?.el) {
        try {
          roRef.current?.unobserve(entry.el)
        } catch { }
      }
      ports.current.delete(portId)
      portCenters.current.delete(portId)
      needsMeasure.current = true
      setGeometryVersion((v) => v + 1)
    },
    [],
  )

  const registerAudioNode: Ctx["registerAudioNode"] = useCallback((portId, node, direction) => {
    const prev = ports.current.get(portId)
    const kind: AudioKind = /cv|gate|trig/i.test(portId) ? "cv" : "audio"

    const entry: PortEntry = prev
      ? { ...prev, audioNode: node, meta: { ...prev.meta, direction: direction ?? prev.meta.direction } }
      : { el: undefined, audioNode: node, meta: { direction, kind } }

    ports.current.set(portId, entry)

    // Bind any edges that touch this port
    connectionsRef.current.forEach((edge) => {
      if (edge.from === portId || edge.to === portId) tryBind(edge)
    })
  }, [])

  // ---- Connections helpers ----
  const portsCompatible = (
    from?: PortEntry,
    to?: PortEntry,
    kind?: Exclude<AudioKind, "any">,
  ): from is PortEntry & { audioNode: AudioNode } => {
    if (!from || !to) return false
    if (from.meta.direction !== "output" || to.meta.direction !== "input") return false
    const k: Exclude<AudioKind, "any"> = kind ?? (from.meta.kind === "cv" || to.meta.kind === "cv" ? "cv" : "audio")
    const outOk = from.meta.kind === k || from.meta.kind === "any"
    const inOk = to.meta.kind === k || to.meta.kind === "any"
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

  const findConnectionIntoInput = (portId: string): { id: string; edge: ConnectionEdge } | null => {
    for (const [id, e] of connectionsRef.current) {
      if (e.to === portId) return { id, edge: e }
    }
    return null
  }

  // ---- Public connection API ----
  const addConnection: Ctx["addConnection"] = useCallback((fromId, toId, kind) => {
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

    // Add the new connection
    const id = uuid()
    const edge: ConnectionEdge = { id, from: fromId, to: toId, kind }
    connectionsRef.current.set(id, edge)

    setConnections(Array.from(connectionsRef.current.values()))

    // Ensure geometry is fresh for both ends before/after drawing
    needsMeasure.current = true
    setGeometryVersion((v) => v + 1)

    tryBind(edge)
  }, [])

  const removeConnection: Ctx["removeConnection"] = useCallback((id) => {
    const edge = connectionsRef.current.get(id)
    if (!edge) return
    tryUnbind(edge)
    connectionsRef.current.delete(id)
    setConnections((xs) => xs.filter((c) => c.id !== id))
    setGeometryVersion((v) => v + 1)
  }, [])

  const clearAllConnections: Ctx["clearAllConnections"] = useCallback(() => {
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
  const beginDrag: Ctx["beginDrag"] = useCallback((fromPortId, clientX, clientY) => {
    needsMeasure.current = true

    const startEntry = ports.current.get(fromPortId)
    if (!startEntry) {
      dragging.current = { active: true, from: fromPortId, pt: { x: clientX, y: clientY } }
      return
    }

    // Dragging from a connected input → detach and start from the source output
    if (startEntry.meta.direction === "input") {
      const hit = findConnectionIntoInput(fromPortId)
      if (hit) {
        const { id, edge } = hit
        tryUnbind(edge)
        connectionsRef.current.delete(id)
        setConnections((xs) => xs.filter((c) => c.id !== id))

        dragging.current = { active: true, from: edge.from, pt: { x: clientX, y: clientY } }

        const fromCenter = portCenters.current.get(edge.from)
        if (fromCenter && tempWireUpdater.current) {
          tempWireUpdater.current(fromCenter, { x: clientX, y: clientY })
        }
        setGeometryVersion((v) => v + 1)
        return
      }
    }

    // Normal start
    dragging.current = { active: true, from: fromPortId, pt: { x: clientX, y: clientY } }
    const fromCenter = portCenters.current.get(fromPortId)
    if (fromCenter && tempWireUpdater.current) {
      tempWireUpdater.current(fromCenter, { x: clientX, y: clientY })
    }
  }, [])

  const updateDrag = useCallback((clientX: number, clientY: number) => {
    if (!dragging.current.active || !dragging.current.from) return
    dragging.current.pt = { x: clientX, y: clientY }
    const from = portCenters.current.get(dragging.current.from)
    if (from && tempWireUpdater.current) tempWireUpdater.current(from, { x: clientX, y: clientY })
  }, [])

  const endDrag = useCallback(
    (maybeToPortId?: string) => {
      const from = dragging.current.from
      dragging.current = { active: false } as any

      // Always clear temp wire
      tempWireUpdater.current?.({ x: 0, y: 0 }, null)

      if (!from || !maybeToPortId) return // dropped on empty space

      const out = ports.current.get(from)
      const inp = ports.current.get(maybeToPortId)
      if (!out || !inp) return
      if (out.meta.direction !== "output" || inp.meta.direction !== "input") return

      const desired: Exclude<AudioKind, "any"> = out.meta.kind === "cv" || inp.meta.kind === "cv" ? "cv" : "audio"

      const outOk = out.meta.kind === desired || out.meta.kind === "any"
      const inOk = inp.meta.kind === desired || inp.meta.kind === "any"
      if (!outOk || !inOk) return

      addConnection(from, maybeToPortId, desired)
    },
    [addConnection],
  )

  const cancelDrag = useCallback(() => {
    dragging.current = { active: false } as any
    tempWireUpdater.current?.({ x: 0, y: 0 }, null)
  }, [])

  // ---- Save / Load ----
  const exportPatch: Ctx["exportPatch"] = useCallback(
    (modules) => ({ modules, connections: Array.from(connectionsRef.current.values()) }),
    [],
  )

  const loadPatch: Ctx["loadPatch"] = useCallback(
    (patch) => {
      clearAllConnections()
      connectionsRef.current.clear()
      patch.connections.forEach((edge) => {
        const id = edge.id || uuid()
        connectionsRef.current.set(id, { ...edge, id })
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
        // Not used by wire-canvas anymore, but kept for compatibility
        return hashColor(portId)
      },
      getConnectedWireColor: (portId) => {
        // Find any connection that involves this port
        // Use connections state array (not ref) so ports re-render when connections change
        for (const edge of connections) {
          if (edge.from === portId || edge.to === portId) {
            // Wire color is ALWAYS based on source port ID hash
            return hashColor(edge.from)
          }
        }
        return null  // No connection found
      },
      registerTempWireUpdater,
      getPortCenter,

      exportPatch,
      loadPatch,
    }),
    [
      connections,
      geometryVersion,
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
