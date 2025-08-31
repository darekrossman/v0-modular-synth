"use client"

import { useEffect, useMemo, useRef } from "react"
import { useSettings } from "@/components/settings-context"
import { useConnections } from "./connection-manager"
import type { ConnectionEdge } from "@/lib/connection-types"

// Deterministic color (FNV-like hash → palette)
function hashColor(s: string) {
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

const cssEscape = (s: string) => {
  // @ts-ignore
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

function makeSagPath(droop: number, shadowOffset: number = 0) {
  const d = Math.max(0, Math.min(1, droop))

  return (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)

    // More realistic catenary-like curve
    // Sag increases with square root of distance (more natural physics)
    // But capped to avoid excessive drooping
    const baseSag = Math.sqrt(dist) * 8 * d  // Further increased for more dramatic sag
    const maxSag = 600 * d  // Increased to 600px max for very dramatic drooping at max setting

    // Account for horizontal vs vertical wires
    // Horizontal wires sag more, vertical wires sag less
    const horizontalFactor = Math.abs(dx) / (dist + 1)  // 0 for vertical, 1 for horizontal
    const sagMultiplier = 0.3 + 0.7 * horizontalFactor  // Reduce sag for vertical wires

    const sag = Math.min(baseSag * sagMultiplier, maxSag) + shadowOffset

    // Use cubic bezier for more realistic curve shape
    // Control points create a natural hanging curve
    const cp1x = a.x + dx * 0.25
    const cp1y = a.y + dy * 0.25 + sag * 0.7  // Increased from 0.5 for more pronounced curve
    const cp2x = a.x + dx * 0.75
    const cp2y = a.y + dy * 0.75 + sag * 0.7  // Increased from 0.5 for more pronounced curve

    // For very short wires, use simpler quadratic curve
    if (dist < 50) {
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2 + sag * 0.8  // Increased from 0.7 for more visible sag
      return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
    }

    // For longer wires, use cubic bezier for more natural curve
    return `M ${a.x} ${a.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${b.x} ${b.y}`
  }
}

export function WireCanvas() {
  const {
    connections,
    registerTempWireUpdater,
    getPortColor, // may return "", so we add fallbacks
    geometryVersion,
  } = useConnections()

  const svgRef = useRef<SVGSVGElement | null>(null)
  const staticLayerRef = useRef<SVGGElement | null>(null)
  const tempPathRef = useRef<SVGPathElement | null>(null)
  const { settings } = useSettings()
  const droopRef = useRef(0.5)
  const opacityRef = useRef(0.7)
  const thicknessRef = useRef(6)
  const sagPathRef = useRef<(a: { x: number; y: number }, b: { x: number; y: number }) => string>(() => "")

  // Keep latest droop and path factory without re-registering handlers
  useEffect(() => {
    const d = Number(settings.wireDroop ?? 0.5)
    const clamped = isFinite(d) ? Math.max(0, Math.min(1, d)) : 0.5
    droopRef.current = clamped
    sagPathRef.current = makeSagPath(clamped)
  }, [settings.wireDroop])

  // Keep latest opacity in a ref for rAF-driven draws
  useEffect(() => {
    const o = Number(settings.wireOpacity ?? 0.7)
    opacityRef.current = isFinite(o) ? Math.max(0, Math.min(1, o)) : 0.7
  }, [settings.wireOpacity])

  // Keep latest thickness in a ref for rAF-driven draws
  useEffect(() => {
    const t = Number(settings.wireThickness ?? 6)
    thicknessRef.current = isFinite(t) ? Math.max(1, Math.min(10, t)) : 6
  }, [settings.wireThickness])

  const groupMap = useRef(new Map<string, SVGGElement>())
  const pathMap = useRef(new Map<string, SVGPathElement>())

  const rafId = useRef<number | null>(null)
  const settleUntil = useRef<number>(0)

  const toSvg = (pt: { x: number; y: number }) => {
    const svg = svgRef.current
    if (!svg) return pt
    const ctm = svg.getScreenCTM()
    if (!ctm) return pt
    const p = svg.createSVGPoint()
    p.x = pt.x
    p.y = pt.y
    const res = p.matrixTransform(ctm.inverse())
    return { x: res.x, y: res.y }
  }

  const getScreenCenter = (portId: string) => {
    const el = document.querySelector<HTMLElement>(`[data-port-id="${cssEscape(portId)}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  // Always return a valid color based on source port
  const pickColor = (edge: ConnectionEdge) => {
    return hashColor(edge.from)
  }

  // Imperative temp-wire drawer
  useEffect(() => {
    registerTempWireUpdater((fromScreen, toScreen) => {
      const pathEl = tempPathRef.current
      if (!pathEl || !toScreen) {
        if (pathEl) pathEl.setAttribute("d", "")
        return
      }
      const a = toSvg(fromScreen)
      const b = toSvg(toScreen)
      pathEl.setAttribute("d", sagPathRef.current(a, b))
    })
  }, [registerTempWireUpdater])

  const shadowPathMap = useRef(new Map<string, SVGPathElement>())

  const ensureEdgeDom = (edge: ConnectionEdge) => {
    const layer = staticLayerRef.current
    if (!layer || groupMap.current.has(edge.id)) return

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
    g.setAttribute("data-edge-id", edge.id)

    // Shadow path (rendered first, behind the main wire)
    const shadowPath = document.createElementNS("http://www.w3.org/2000/svg", "path")
    shadowPath.setAttribute("fill", "none")
    shadowPath.setAttribute("stroke", "black")
    shadowPath.setAttribute("stroke-width", String(thicknessRef.current))  // Same width as wire
    shadowPath.setAttribute("stroke-opacity", "0.2")
    shadowPath.setAttribute("vector-effect", "non-scaling-stroke")
    shadowPath.setAttribute("filter", "url(#wireShadowBlur)")

    const p = document.createElementNS("http://www.w3.org/2000/svg", "path")
    p.setAttribute("fill", "none")
    p.setAttribute("stroke-width", "6")
    p.setAttribute("stroke-opacity", String(opacityRef.current))
    p.setAttribute("vector-effect", "non-scaling-stroke")

    // Render order: shadow, then wire
    g.appendChild(shadowPath)
    g.appendChild(p)
    layer.appendChild(g)

    groupMap.current.set(edge.id, g)
    pathMap.current.set(edge.id, p)
    shadowPathMap.current.set(edge.id, shadowPath)
  }

  const pruneMissingEdges = (present: Set<string>) => {
    for (const [id, g] of groupMap.current) {
      if (!present.has(id)) {
        try {
          g.remove()
        } catch { }
        groupMap.current.delete(id)
        pathMap.current.delete(id)
        shadowPathMap.current.delete(id)
      }
    }
  }

  const drawEdge = (edge: ConnectionEdge) => {
    const p = pathMap.current.get(edge.id)
    const shadowPath = shadowPathMap.current.get(edge.id)
    const g = groupMap.current.get(edge.id)
    if (!p || !shadowPath || !g) return

    const aScr = getScreenCenter(edge.from)
    const bScr = getScreenCenter(edge.to)
    if (!aScr || !bScr) {
      p.setAttribute("d", "")
      shadowPath.setAttribute("d", "")
      return
    }

    const a = toSvg(aScr)
    const b = toSvg(bScr)
    
    // Wire goes directly to port centers
    const d = sagPathRef.current(a, b)

    // Create shadow path with additional vertical offset
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const shadowVerticalOffset = Math.min(15, dist * 0.05)  // 5% of distance, max 15px
    const shadowSagPath = makeSagPath(droopRef.current, shadowVerticalOffset)
    const shadowD = shadowSagPath(a, b)  // Same endpoints, but sags lower

    const color = pickColor(edge)

    // Set shadow path
    shadowPath.setAttribute("d", shadowD)
    shadowPath.setAttribute("stroke-width", String(thicknessRef.current))  // Same thickness as wire

    // Set main wire path
    p.setAttribute("d", d)
    p.setAttribute("stroke", color)
    const opacity = opacityRef.current
    p.setAttribute("stroke-opacity", String(opacity))
    // Apply current thickness
    p.setAttribute("stroke-width", String(thicknessRef.current))
  }

  const tick = () => {
    const now = performance.now()
    for (const edge of connections) drawEdge(edge)
    if (now < settleUntil.current) {
      rafId.current = requestAnimationFrame(tick)
    } else {
      rafId.current = null
    }
  }

  // Build DOM for edges when list changes; start settle window
  useEffect(() => {
    const present = new Set<string>()
    for (const edge of connections) {
      present.add(edge.id)
      ensureEdgeDom(edge)
    }
    pruneMissingEdges(present)
    settleUntil.current = performance.now() + 400
    if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections])

  // Also refresh on geometry/droop changes
  useEffect(() => {
    settleUntil.current = performance.now() + 400
    if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryVersion, settings.wireDroop, settings.wireOpacity, settings.wireThickness])

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      groupMap.current.forEach((g) => {
        try {
          g.remove()
        } catch { }
      })
      groupMap.current.clear()
      pathMap.current.clear()
      shadowPathMap.current.clear()
    }
  }, [])

  const items = useMemo(() => connections, [connections])

  return (
    <svg ref={svgRef} className="pointer-events-none fixed inset-0 w-full h-full z-40" shapeRendering="geometricPrecision">
      <defs>
        <filter id="wireShadowBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>

      {/* Temp wire */}
      <path
        ref={tempPathRef}
        stroke="#fff"
        strokeWidth={Math.max(1, Math.min(10, Number(settings.wireThickness ?? 6)))}
        fill="none"
        strokeOpacity={Number(settings.wireOpacity ?? 0.7)}
        vectorEffect="non-scaling-stroke"
      />

      {/* Static wires layer (imperative) */}
      <g ref={staticLayerRef} />

      {/* Hidden keyed list keeps React aware of edges */}
      <g style={{ display: "none" }}>
        {items.map((e) => (
          <g key={e.id} />
        ))}
      </g>
    </svg>
  )
}
