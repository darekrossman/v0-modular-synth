"use client"

import { useEffect, useMemo, useRef } from "react"
import { useSettings } from "@/components/settings-context"
import { useConnections } from "./connection-manager"
import type { ConnectionEdge } from "@/lib/connection-types"


const cssEscape = (s: string) => {
  // @ts-ignore
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&")
}

// Unified wire physics calculation
function calculateWirePhysics(dist: number, dx: number, dy: number, tension: number, shadowOffset: number = 0) {
  const slack = 1 - tension

  // For short distances, we need MUCH more extra wire
  // Use inverse relationship: shorter wires get proportionally more extra length
  const distanceFactor = Math.max(50, dist)  // Minimum 50px for calculations
  const inverseBonus = 300 / distanceFactor  // Bonus multiplier for short wires (6x at 50px, 1.5x at 200px)

  // Base extra wire - more for short connections
  const baseExtra = slack * 250 * inverseBonus

  // Proportional extra - still add some based on distance
  const proportionalExtra = dist * slack * 0.5

  // Total wire arc length
  const wireArcLength = dist + baseExtra + proportionalExtra

  // Calculate sag from excess wire
  const excessWire = wireArcLength - dist
  let sag = 0
  if (excessWire > 0) {
    // More aggressive sag formula for visibility
    sag = Math.sqrt(excessWire * Math.max(30, dist)) / 1.5
  }

  // Gravity effect - but scale it by slack so it disappears at high tension
  const horizontalRatio = dist > 0 ? Math.abs(dx) / dist : 0
  const gravityEffect = (1.0 - (0.3 * horizontalRatio)) * slack  // Scale gravity by slack

  return (sag * gravityEffect) + shadowOffset
}

function makeSagPath(droop: number, shadowOffset: number = 0, clipRadius: number = 0) {
  const d = Math.max(0, Math.min(1, droop))

  return (a: { x: number; y: number }, b: { x: number; y: number }): { path: string; startAngle: number; endAngle: number } => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)

    // Use unified physics calculation
    const tension = 1 - d
    const sag = calculateWirePhysics(dist, dx, dy, tension, shadowOffset)

    // Calculate control points for natural catenary curve
    let cp1x, cp2x, cp1y, cp2y

    // Control point positions should interpolate based on tension
    // At tension = 1 (slack = 0), control points are on the straight line
    // At tension = 0 (slack = 1), control points create maximum curve
    const slack = 1 - tension

    // Smooth transition based on how vertical the wire is
    const horizontalness = dist > 0 ? Math.abs(dx) / dist : 0
    const verticalness = 1.0 - horizontalness

    // For horizontal spread, reduce for vertical wires
    const minHorizontal = 0.01
    const horizontalFactor = Math.max(minHorizontal, horizontalness)

    // Base control point positions (for straight line)
    const straightCp1x = a.x + dx * 0.35
    const straightCp2x = a.x + dx * 0.65
    const straightCp1y = a.y + dy * 0.35
    const straightCp2y = a.y + dy * 0.65

    // Saggy control point positions (with catenary adjustment)
    const sagCp1x = a.x + dx * 0.35 * horizontalFactor
    const sagCp2x = a.x + dx * 0.65 * horizontalFactor
    const sagCp1y = a.y + dy * (0.35 - verticalness * 0.1) + sag
    const sagCp2y = a.y + dy * (0.65 + verticalness * 0.1) + sag

    // Interpolate between straight and saggy based on slack
    cp1x = straightCp1x + (sagCp1x - straightCp1x) * slack
    cp2x = straightCp2x + (sagCp2x - straightCp2x) * slack
    cp1y = straightCp1y + (sagCp1y - straightCp1y) * slack
    cp2y = straightCp2y + (sagCp2y - straightCp2y) * slack

    // Always calculate tangent vectors and apply offsets consistently
    // At t=0, tangent points from start toward first control point
    const startTangentX = cp1x - a.x
    const startTangentY = cp1y - a.y
    const startTangentDist = Math.hypot(startTangentX, startTangentY)

    // At t=1, tangent points from second control point toward end
    const endTangentX = b.x - cp2x
    const endTangentY = b.y - cp2y
    const endTangentDist = Math.hypot(endTangentX, endTangentY)

    // Calculate unit vectors with sensible defaults for zero-length tangents
    let startUnitX, startUnitY, endUnitX, endUnitY

    if (startTangentDist > 0.001) {
      startUnitX = startTangentX / startTangentDist
      startUnitY = startTangentY / startTangentDist
    } else {
      // Default: wire leaves downward due to sag
      startUnitX = 0
      startUnitY = 1
    }

    if (endTangentDist > 0.001) {
      endUnitX = endTangentX / endTangentDist
      endUnitY = endTangentY / endTangentDist
    } else {
      // Default: wire arrives from above (opposite of start)
      endUnitX = 0
      endUnitY = 1  // Points down (wire comes from above, so tangent at end points down)
    }

    // Always apply offsets if clipRadius > 0
    let startPoint = a
    let endPoint = b

    if (clipRadius > 0) {
      startPoint = {
        x: a.x + startUnitX * clipRadius,
        y: a.y + startUnitY * clipRadius
      }
      endPoint = {
        x: b.x - endUnitX * clipRadius,
        y: b.y - endUnitY * clipRadius
      }

      // Adjust control points to maintain smooth curve
      const cp1xAdjusted = cp1x - startUnitX * clipRadius * 0.25
      const cp1yAdjusted = cp1y - startUnitY * clipRadius * 0.25
      const cp2xAdjusted = cp2x + endUnitX * clipRadius * 0.25
      const cp2yAdjusted = cp2y + endUnitY * clipRadius * 0.25

      // Calculate angles for ring rotation
      const startAngle = Math.atan2(startUnitY, startUnitX) * 180 / Math.PI
      const endAngle = Math.atan2(-endUnitY, -endUnitX) * 180 / Math.PI

      return {
        path: `M ${startPoint.x} ${startPoint.y} C ${cp1xAdjusted} ${cp1yAdjusted}, ${cp2xAdjusted} ${cp2yAdjusted}, ${endPoint.x} ${endPoint.y}`,
        startAngle,
        endAngle
      }
    } else {
      // No clipping radius - wire goes directly to centers
      const startAngle = Math.atan2(startUnitY, startUnitX) * 180 / Math.PI
      const endAngle = Math.atan2(-endUnitY, -endUnitX) * 180 / Math.PI

      return {
        path: `M ${a.x} ${a.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${b.x} ${b.y}`,
        startAngle,
        endAngle
      }
    }
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
  const tempShadowPathRef = useRef<SVGPathElement | null>(null)
  const tempColorRef = useRef<string>("#fff")
  const tempStartRingRef = useRef<SVGGElement | null>(null)
  const tempEndRingRef = useRef<SVGGElement | null>(null)
  const { settings } = useSettings()
  const tensionRef = useRef(0.5)
  const opacityRef = useRef(0.7)
  const thicknessRef = useRef(6)
  const sagPathRef = useRef<(a: { x: number; y: number }, b: { x: number; y: number }) => { path: string; startAngle: number; endAngle: number }>(() => ({ path: "", startAngle: 0, endAngle: 0 }))

  // Keep latest tension and path factory without re-registering handlers
  useEffect(() => {
    const t = Number(settings.wireTension ?? 0.5)
    const clamped = isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.5
    tensionRef.current = clamped
    // Invert tension for sag calculation: high tension (1) = no sag (0), low tension (0) = max sag (1)
    const sag = 1 - clamped
    // Adjust clip radius based on tension - tighter wires need more offset for triangle tip
    const clipRadius = 13 + (clamped * 2) // 13-15px based on tension
    sagPathRef.current = makeSagPath(sag, 0, clipRadius)
  }, [settings.wireTension])

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

  // Use the color stored in the edge
  const pickColor = (edge: ConnectionEdge) => {
    return edge.color
  }

  // Imperative temp-wire drawer
  useEffect(() => {
    registerTempWireUpdater((fromScreen, toScreen, color) => {
      const pathEl = tempPathRef.current
      const shadowPathEl = tempShadowPathRef.current
      const startRing = tempStartRingRef.current
      const endRing = tempEndRingRef.current

      if (!pathEl || !shadowPathEl || !toScreen) {
        // Clean up temp wire and rings
        if (pathEl) pathEl.setAttribute("d", "")
        if (shadowPathEl) shadowPathEl.setAttribute("d", "")
        if (startRing) startRing.style.display = 'none'
        if (endRing) endRing.style.display = 'none'
        return
      }

      const a = toSvg(fromScreen)
      const b = toSvg(toScreen)

      // Use the SAME function that permanent wires use!
      const result = sagPathRef.current(a, b)

      // Create shadow path with additional vertical offset (same as permanent wires)
      const dist = Math.hypot(b.x - a.x, b.y - a.y)
      const shadowVerticalOffset = Math.min(15, dist * 0.05)  // 5% of distance, max 15px
      const tension = tensionRef.current
      const clipRadius = 13 + (tension * 2) // Same as main path
      const shadowSagPath = makeSagPath(1 - tension, shadowVerticalOffset, clipRadius)
      const shadowResult = shadowSagPath(a, b)

      // Set the shadow path
      shadowPathEl.setAttribute("d", shadowResult.path)
      shadowPathEl.setAttribute("stroke-width", String(thicknessRef.current))

      // Set the wire path
      pathEl.setAttribute("d", result.path)
      pathEl.setAttribute("stroke-width", String(thicknessRef.current))

      if (color) {
        pathEl.setAttribute("stroke", color)
        tempColorRef.current = color
      }

      // Position and show temp wire rings
      if (startRing && endRing) {
        // Show and position start ring
        startRing.style.display = ''
        startRing.setAttribute('transform', `translate(${a.x}, ${a.y}) rotate(${result.startAngle})`)
        const startCircle = startRing.children[0] as SVGCircleElement
        const startTriangle = startRing.children[1] as SVGPathElement
        if (startCircle && startTriangle && color) {
          startCircle.setAttribute('stroke', color)
          startTriangle.setAttribute('stroke', color)
        }

        // Show and position end ring at cursor/end point
        endRing.style.display = ''
        endRing.setAttribute('transform', `translate(${b.x}, ${b.y}) rotate(${result.endAngle})`)
        const endCircle = endRing.children[0] as SVGCircleElement
        const endTriangle = endRing.children[1] as SVGPathElement
        if (endCircle && endTriangle && color) {
          endCircle.setAttribute('stroke', color)
          endTriangle.setAttribute('stroke', color)
        }
      }
    })
  }, [registerTempWireUpdater, tensionRef])

  const shadowPathMap = useRef(new Map<string, SVGPathElement>())
  const startRingMap = useRef(new Map<string, SVGGElement>())
  const endRingMap = useRef(new Map<string, SVGGElement>())

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
    shadowPath.setAttribute("stroke-opacity", String(0.15 * opacityRef.current))
    shadowPath.setAttribute("stroke-linecap", "round")  // Round end caps
    shadowPath.setAttribute("vector-effect", "non-scaling-stroke")
    shadowPath.setAttribute("filter", "url(#wireShadowBlur)")

    const p = document.createElementNS("http://www.w3.org/2000/svg", "path")
    p.setAttribute("fill", "none")
    p.setAttribute("stroke-width", "6")
    p.setAttribute("stroke-opacity", String(opacityRef.current))
    p.setAttribute("stroke-linecap", "round")  // Round end caps
    p.setAttribute("vector-effect", "non-scaling-stroke")

    // Create end rings that rotate with wire direction
    // Create triangular-pointed ring shapes
    const startRing = document.createElementNS("http://www.w3.org/2000/svg", "g")
    // Create a group with a circle and triangle
    const startCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    startCircle.setAttribute("r", "10")
    startCircle.setAttribute("fill", "none")
    startCircle.setAttribute("stroke-width", "6")  // Extra thick ring
    const startTriangle = document.createElementNS("http://www.w3.org/2000/svg", "path")
    // Rounded triangle tip using arc for smooth connection
    startTriangle.setAttribute("d", "M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7")
    startTriangle.setAttribute("fill", "none")
    startTriangle.setAttribute("stroke-width", "6")  // Extra thick triangle
    startRing.appendChild(startCircle)
    startRing.appendChild(startTriangle)
    // Ring attributes are set on child elements
    startCircle.setAttribute("stroke-opacity", "1")
    startTriangle.setAttribute("stroke-opacity", "1")
    startRing.setAttribute("class", "wire-start-ring")

    const endRing = document.createElementNS("http://www.w3.org/2000/svg", "g")
    const endCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    endCircle.setAttribute("r", "10")
    endCircle.setAttribute("fill", "none")
    endCircle.setAttribute("stroke-width", "6")  // Extra thick ring
    endCircle.setAttribute("stroke-opacity", "1")
    const endTriangle = document.createElementNS("http://www.w3.org/2000/svg", "path")
    // Rounded triangle tip using arc for smooth connection
    endTriangle.setAttribute("d", "M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7")
    endTriangle.setAttribute("fill", "none")
    endTriangle.setAttribute("stroke-width", "6")  // Extra thick triangle
    endTriangle.setAttribute("stroke-opacity", "1")
    endRing.appendChild(endCircle)
    endRing.appendChild(endTriangle)
    endRing.setAttribute("class", "wire-end-ring")

    // Render order: shadow, rings, then wire
    g.appendChild(shadowPath)
    g.appendChild(startRing)
    g.appendChild(endRing)
    g.appendChild(p)
    layer.appendChild(g)

    groupMap.current.set(edge.id, g)
    pathMap.current.set(edge.id, p)
    shadowPathMap.current.set(edge.id, shadowPath)
    startRingMap.current.set(edge.id, startRing)
    endRingMap.current.set(edge.id, endRing)
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
        startRingMap.current.delete(id)
        endRingMap.current.delete(id)
      }
    }
  }

  const drawEdge = (edge: ConnectionEdge) => {
    const p = pathMap.current.get(edge.id)
    const shadowPath = shadowPathMap.current.get(edge.id)
    const startRing = startRingMap.current.get(edge.id)
    const endRing = endRingMap.current.get(edge.id)
    const g = groupMap.current.get(edge.id)
    if (!p || !shadowPath || !startRing || !endRing || !g) return

    const aScr = getScreenCenter(edge.from)
    const bScr = getScreenCenter(edge.to)
    if (!aScr || !bScr) {
      p.setAttribute("d", "")
      shadowPath.setAttribute("d", "")
      startRing.setAttribute("transform", "translate(-1000, -1000)")
      endRing.setAttribute("transform", "translate(-1000, -1000)")
      return
    }

    const a = toSvg(aScr)
    const b = toSvg(bScr)

    // Wire with path and angles
    const result = sagPathRef.current(a, b)

    // Create shadow path with additional vertical offset
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const shadowVerticalOffset = Math.min(15, dist * 0.05)  // 5% of distance, max 15px
    const tension = tensionRef.current
    const clipRadius = 13 + (tension * 2) // Same as main path
    const shadowSagPath = makeSagPath(1 - tension, shadowVerticalOffset, clipRadius)
    const shadowResult = shadowSagPath(a, b)

    const color = pickColor(edge)

    // Set shadow path
    shadowPath.setAttribute("d", shadowResult.path)
    shadowPath.setAttribute("stroke-width", String(thicknessRef.current))  // Same thickness as wire

    // Set main wire path
    p.setAttribute("d", result.path)
    p.setAttribute("stroke", color)
    const opacity = opacityRef.current
    p.setAttribute("stroke-opacity", String(opacity))
    shadowPath.setAttribute("stroke-opacity", String(0.15 * opacity))
    p.setAttribute("stroke-width", String(thicknessRef.current))

    // Position and style the triangular wire rings with rotation
    const startCircle = startRing.children[0] as SVGCircleElement
    const startTriangle = startRing.children[1] as SVGPathElement
    if (startCircle && startTriangle) {
      startCircle.setAttribute("stroke", color)
      startTriangle.setAttribute("stroke", color)
    }
    startRing.setAttribute("transform", `translate(${a.x}, ${a.y}) rotate(${result.startAngle})`)

    const endCircle = endRing.children[0] as SVGCircleElement
    const endTriangle = endRing.children[1] as SVGPathElement
    if (endCircle && endTriangle) {
      endCircle.setAttribute("stroke", color)
      endTriangle.setAttribute("stroke", color)
    }
    endRing.setAttribute("transform", `translate(${b.x}, ${b.y}) rotate(${result.endAngle})`)
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

  // Also refresh on geometry/tension changes
  useEffect(() => {
    settleUntil.current = performance.now() + 400
    if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryVersion, settings.wireTension, settings.wireOpacity, settings.wireThickness])

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
      startRingMap.current.clear()
      endRingMap.current.clear()
    }
  }, [])

  const items = useMemo(() => connections, [connections])

  return (
    <svg ref={svgRef} className="pointer-events-none fixed inset-0 w-full h-full z-40" shapeRendering="geometricPrecision">
      <defs>
        <filter id="wireShadowBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0" />
        </filter>
      </defs>

      {/* Temp wire with rings */}
      <g>
        {/* Temp wire shadow (rendered first) */}
        <path
          ref={tempShadowPathRef}
          stroke="black"
          strokeWidth={Math.max(1, Math.min(10, Number(settings.wireThickness ?? 6)))}
          fill="none"
          strokeOpacity={String(0.15 * opacityRef.current)}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          filter="url(#wireShadowBlur)"
        />

        {/* Temp start ring */}
        <g ref={tempStartRingRef} style={{ display: 'none' }}>
          <circle r="10" fill="none" strokeWidth="6" strokeOpacity={1} />
          <path d="M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7" fill="none" strokeWidth="6" strokeOpacity={1} />
        </g>

        {/* Temp end ring */}
        <g ref={tempEndRingRef} style={{ display: 'none' }}>
          <circle r="10" fill="none" strokeWidth="6" strokeOpacity={1} />
          <path d="M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7" fill="none" strokeWidth="6" strokeOpacity={1} />
        </g>

        {/* Temp wire path */}
        <path
          ref={tempPathRef}
          stroke={tempColorRef.current}
          strokeWidth={Math.max(1, Math.min(10, Number(settings.wireThickness ?? 6)))}
          fill="none"
          strokeOpacity={Number(settings.wireOpacity ?? 0.7)}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>

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
