"use client"

import { useEffect, useMemo, useRef } from "react"
import { useSettings } from "@/components/settings-context"
import { useConnections } from "./connection-manager"
import type { ConnectionEdge } from "./connection-types"

// Deterministic color fallback (FNV-like hash → palette)
function hashColor(s: string) {
  if (!s || typeof s !== "string" || s.trim() === "") {
    return "#888888" // Safe fallback color
  }

  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const palette = ["#FF3B30", "#00D4AA", "#007AFF", "#34C759", "#FF9500", "#AF52DE", "#FFCC00"]
  return palette[h % palette.length]
}

const cssEscape = (s: string) => {
  // @ts-ignore
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

function makeSagPath(droop: number) {
  const d = Math.max(0, Math.min(1, droop))
  const scale = 0.9 * d // 0..0.9 ; 0.5 -> 0.45
  const cap = 260 * d   // 0..260 ; 0.5 -> 130
  return (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)
    const sag = Math.min(dist * scale, cap)
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2 + sag
    return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
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

  const groupMap = useRef(new Map<string, SVGGElement>())
  const pathMap = useRef(new Map<string, SVGPathElement>())
  const aDotMap = useRef(new Map<string, SVGCircleElement>())
  const bDotMap = useRef(new Map<string, SVGCircleElement>())

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

  // Always return a valid color
  const pickColor = (edge: ConnectionEdge) => {
    // Prefer the source port's color, then the target's, then hash(edge.id)
    if (getPortColor && edge.from && typeof edge.from === "string" && edge.from.trim()) {
      const c1 = getPortColor(edge.from)
      if (c1 && typeof c1 === "string" && c1.trim() && c1 !== "") {
        return c1
      }
    }

    if (getPortColor && edge.to && typeof edge.to === "string" && edge.to.trim()) {
      const c2 = getPortColor(edge.to)
      if (c2 && typeof c2 === "string" && c2.trim() && c2 !== "") {
        return c2
      }
    }

    // Final fallback using edge ID
    const fallbackColor = hashColor(edge.id || "default")
    return fallbackColor
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
      const sagPath = makeSagPath(Number(settings.wireDroop ?? 0.5))
      pathEl.setAttribute("d", sagPath(a, b))
    })
  }, [registerTempWireUpdater, settings.wireDroop])

  const ensureEdgeDom = (edge: ConnectionEdge) => {
    const layer = staticLayerRef.current
    if (!layer || groupMap.current.has(edge.id)) return

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g")
    g.setAttribute("filter", "url(#wireGlow)")
    g.setAttribute("data-edge-id", edge.id)

    const p = document.createElementNS("http://www.w3.org/2000/svg", "path")
    p.setAttribute("fill", "none")
    p.setAttribute("stroke-width", "6")
    p.setAttribute("stroke-opacity", "0.5")
    p.setAttribute("vector-effect", "non-scaling-stroke")
    // safe default so wire is never invisible
    p.setAttribute("stroke", "#888")

    const ca = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    ca.setAttribute("r", "3.5")
    ca.setAttribute("fill", "#888")

    const cb = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    cb.setAttribute("r", "3.5")
    cb.setAttribute("fill", "#888")

    g.appendChild(p)
    g.appendChild(ca)
    g.appendChild(cb)
    layer.appendChild(g)

    groupMap.current.set(edge.id, g)
    pathMap.current.set(edge.id, p)
    aDotMap.current.set(edge.id, ca)
    bDotMap.current.set(edge.id, cb)
  }

  const pruneMissingEdges = (present: Set<string>) => {
    for (const [id, g] of groupMap.current) {
      if (!present.has(id)) {
        try {
          g.remove()
        } catch {}
        groupMap.current.delete(id)
        pathMap.current.delete(id)
        aDotMap.current.delete(id)
        bDotMap.current.delete(id)
      }
    }
  }

  const drawEdge = (edge: ConnectionEdge) => {
    const p = pathMap.current.get(edge.id)
    const ca = aDotMap.current.get(edge.id)
    const cb = bDotMap.current.get(edge.id)
    if (!p || !ca || !cb) return

    const aScr = getScreenCenter(edge.from)
    const bScr = getScreenCenter(edge.to)
    if (!aScr || !bScr) {
      p.setAttribute("d", "")
      return
    }

    const a = toSvg(aScr)
    const b = toSvg(bScr)
    const sagPath = makeSagPath(Number(settings.wireDroop ?? 0.5))
    const d = sagPath(a, b)
    const color = pickColor(edge)

    const safeColor = color && typeof color === "string" && color.trim() ? color : "#888888"

    p.setAttribute("d", d)
    p.setAttribute("stroke", safeColor)
    ca.setAttribute("cx", String(a.x))
    ca.setAttribute("cy", String(a.y))
    ca.setAttribute("fill", safeColor)
    cb.setAttribute("cx", String(b.x))
    cb.setAttribute("cy", String(b.y))
    cb.setAttribute("fill", safeColor)
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
  }, [geometryVersion, settings.wireDroop])

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      groupMap.current.forEach((g) => {
        try {
          g.remove()
        } catch {}
      })
      groupMap.current.clear()
      pathMap.current.clear()
      aDotMap.current.clear()
      bDotMap.current.clear()
    }
  }, [])

  const items = useMemo(() => connections, [connections])

  return (
    <svg ref={svgRef} className="pointer-events-none fixed inset-0 w-full h-full z-40" shapeRendering="optimizeSpeed">
      <defs>
        <filter id="wireGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow stdDeviation="1.5" dx="0" dy="0" floodOpacity="0.7" />
        </filter>
      </defs>

      {/* Temp wire */}
      <path
        ref={tempPathRef}
        stroke="#fff"
        strokeWidth="4"
        fill="none"
        strokeOpacity="0.9"
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
