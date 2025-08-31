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

function makeSagPath(droop: number, shadowOffset: number = 0, clipRadius: number = 0) {
  const d = Math.max(0, Math.min(1, droop))

  return (a: { x: number; y: number }, b: { x: number; y: number }): { path: string; startAngle: number; endAngle: number } => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)

    // Calculate sag for physics
    const baseSag = Math.sqrt(dist) * 8 * d
    const maxSag = 600 * d

    // Account for horizontal vs vertical wires
    const horizontalFactor = Math.abs(dx) / (dist + 1)
    const sagMultiplier = 0.3 + 0.7 * horizontalFactor

    const sag = Math.min(baseSag * sagMultiplier, maxSag) + shadowOffset

    // Calculate control points for the bezier curve
    const cp1x = a.x + dx * 0.25
    const cp1y = a.y + dy * 0.25 + sag * 0.7
    const cp2x = a.x + dx * 0.75
    const cp2y = a.y + dy * 0.75 + sag * 0.7

    // For very short wires, use simpler quadratic curve
    if (dist < 50) {
      const mx = (a.x + b.x) / 2
      const my = (a.y + b.y) / 2 + sag * 0.8
      
      if (clipRadius > 0 && dist > clipRadius * 2) {
        // For quadratic, calculate tangent at endpoints
        // Tangent at start points toward control point
        const startTangentX = mx - a.x
        const startTangentY = my - a.y
        const startTangentDist = Math.hypot(startTangentX, startTangentY)
        const startUnitX = startTangentX / startTangentDist
        const startUnitY = startTangentY / startTangentDist
        
        // Tangent at end points from control point
        const endTangentX = b.x - mx
        const endTangentY = b.y - my
        const endTangentDist = Math.hypot(endTangentX, endTangentY)
        const endUnitX = endTangentX / endTangentDist
        const endUnitY = endTangentY / endTangentDist
        
        const startPoint = {
          x: a.x + startUnitX * clipRadius,
          y: a.y + startUnitY * clipRadius
        }
        const endPoint = {
          x: b.x - endUnitX * clipRadius,
          y: b.y - endUnitY * clipRadius
        }
        
        // Calculate angles for ring rotation
        const startAngle = Math.atan2(startUnitY, startUnitX) * 180 / Math.PI
        const endAngle = Math.atan2(-endUnitY, -endUnitX) * 180 / Math.PI
        
        return {
          path: `M ${startPoint.x} ${startPoint.y} Q ${mx} ${my} ${endPoint.x} ${endPoint.y}`,
          startAngle,
          endAngle
        }
      }
      
      // Calculate angles even without clipping
      const startAngle = Math.atan2(my - a.y, mx - a.x) * 180 / Math.PI
      const endAngle = Math.atan2(b.y - my, b.x - mx) * 180 / Math.PI
      
      return {
        path: `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`,
        startAngle,
        endAngle
      }
    }

    // For cubic bezier curves
    if (clipRadius > 0 && dist > clipRadius * 2) {
      // Calculate tangent vectors at the endpoints of the cubic bezier
      // At t=0, tangent points from start toward first control point
      const startTangentX = cp1x - a.x
      const startTangentY = cp1y - a.y
      const startTangentDist = Math.hypot(startTangentX, startTangentY)
      const startUnitX = startTangentX / startTangentDist
      const startUnitY = startTangentY / startTangentDist
      
      // At t=1, tangent points from second control point toward end
      const endTangentX = b.x - cp2x
      const endTangentY = b.y - cp2y
      const endTangentDist = Math.hypot(endTangentX, endTangentY)
      const endUnitX = endTangentX / endTangentDist
      const endUnitY = endTangentY / endTangentDist
      
      // Offset along the tangent directions
      const startPoint = {
        x: a.x + startUnitX * clipRadius,
        y: a.y + startUnitY * clipRadius
      }
      const endPoint = {
        x: b.x - endUnitX * clipRadius,
        y: b.y - endUnitY * clipRadius
      }
      
      // Adjust control points to maintain smooth curve
      // Move them slightly to account for the shortened endpoints
      const adjustFactor = clipRadius / dist
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
    }

    // No clipping for very short distances or when clipRadius is 0
    // Still calculate angles from control points
    const startAngle = Math.atan2(cp1y - a.y, cp1x - a.x) * 180 / Math.PI
    const endAngle = Math.atan2(b.y - cp2y, b.x - cp2x) * 180 / Math.PI
    
    return {
      path: `M ${a.x} ${a.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${b.x} ${b.y}`,
      startAngle,
      endAngle
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
      const startRing = tempStartRingRef.current
      const endRing = tempEndRingRef.current
      
      if (!pathEl || !toScreen) {
        // Clean up temp wire and rings
        if (pathEl) pathEl.setAttribute("d", "")
        if (startRing) startRing.style.display = 'none'
        if (endRing) endRing.style.display = 'none'
        return
      }
      const a = toSvg(fromScreen)
      let b = toSvg(toScreen)
      
      // Calculate actual distance between endpoints
      const dx = b.x - a.x
      const dy = b.y - a.y
      const actualDist = Math.hypot(dx, dy)
      
      // Wire physics constants based on tension
      const tension = tensionRef.current
      const slack = 1 - tension
      
      // Minimum arc length of the wire (the actual wire length)
      // This is the physical length of the wire material
      const minArcLength = 40 + slack * 80  // 40px at high tension, up to 120px at low tension
      
      // Calculate how much the wire needs to sag to maintain its arc length
      // When endpoints are closer than the arc length, wire must sag
      let sag = 0
      if (actualDist < minArcLength) {
        // Use catenary formula approximation: for a wire of length L between points distance D apart,
        // the sag S ≈ sqrt((L² - D²) / 8)
        const lengthSquared = minArcLength * minArcLength
        const distSquared = actualDist * actualDist
        sag = Math.sqrt(Math.max(0, lengthSquared - distSquared) / 8)
      } else {
        // Wire is taut, minimal sag based on tension
        sag = slack * 10  // Small amount of natural sag
      }
      
      // Add gravity effect - wire sags downward
      const horizontalRatio = actualDist > 0.1 ? Math.abs(dx) / actualDist : 0
      sag = sag * (0.5 + 0.5 * horizontalRatio)  // More sag when horizontal
      
      // Control points for bezier curve
      const cp1x = a.x + dx * 0.25
      const cp1y = a.y + dy * 0.25 + sag
      const cp2x = a.x + dx * 0.75  
      const cp2y = a.y + dy * 0.75 + sag
      
      // Calculate tangent at start (from start toward first control point)
      const startTangentX = cp1x - a.x
      const startTangentY = cp1y - a.y
      const startTangentDist = Math.hypot(startTangentX, startTangentY)
      
      // Offset for triangle tip attachment
      const offsetDistance = 13 + tension * 2  // 13-15px based on tension
      
      // When wire has slack, it doesn't pull upward as strongly
      // The ring should stay more horizontal when there's excess wire
      let startUnitX = 1, startUnitY = 0
      let startPoint = a
      
      if (startTangentDist > 0.1) {
        startUnitX = startTangentX / startTangentDist
        startUnitY = startTangentY / startTangentDist
        
        // If wire has slack (actualDist < minArcLength), reduce upward pull
        if (actualDist < minArcLength && startUnitY < 0) {
          // Wire is slack and pulling upward - reduce the upward component
          const slackRatio = actualDist / minArcLength  // 0 when fully slack, 1 when taut
          // Blend toward horizontal as slack increases
          startUnitY = startUnitY * slackRatio  // Reduce upward pull based on slack
          // Renormalize
          const newDist = Math.hypot(startUnitX, startUnitY)
          if (newDist > 0.1) {
            startUnitX = startUnitX / newDist
            startUnitY = startUnitY / newDist
          }
        }
        
        startPoint = {
          x: a.x + startUnitX * offsetDistance,
          y: a.y + startUnitY * offsetDistance
        }
      }
      
      // End point is always at actual cursor position (not extended)
      const endPoint = toSvg(toScreen)
      
      // Calculate end tangent for wire offset
      // The tangent at the end comes from the second control point toward the end
      const endTangentX = endPoint.x - cp2x
      const endTangentY = endPoint.y - cp2y
      const endTangentDist = Math.hypot(endTangentX, endTangentY)
      
      // Calculate unit vectors for end ring rotation
      let endUnitX = endTangentDist > 0.1 ? endTangentX / endTangentDist : -1
      let endUnitY = endTangentDist > 0.1 ? endTangentY / endTangentDist : 0
      
      // Apply same slack adjustment for end ring
      if (actualDist < minArcLength && endUnitY < 0) {
        const slackRatio = actualDist / minArcLength
        endUnitY = endUnitY * slackRatio
        // Renormalize
        const newDist = Math.hypot(endUnitX, endUnitY)
        if (newDist > 0.1) {
          endUnitX = endUnitX / newDist
          endUnitY = endUnitY / newDist
        }
      }
      
      // Calculate adjusted endpoint with offset for triangle tip
      let adjustedEndPoint = endPoint
      if (endTangentDist > 0.1) {
        const offsetDistance = 13 + tension * 2  // Same as start offset
        adjustedEndPoint = {
          x: endPoint.x - endUnitX * offsetDistance,  // Pull wire back from end ring
          y: endPoint.y - endUnitY * offsetDistance
        }
      }
      
      // Draw the path - always use cubic bezier for consistency
      const path = `M ${startPoint.x} ${startPoint.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${adjustedEndPoint.x} ${adjustedEndPoint.y}`
      pathEl.setAttribute("d", path)
      
      if (color) {
        pathEl.setAttribute("stroke", color)
        tempColorRef.current = color
      }
      
      // Position and show temp wire rings
      if (startRing && endRing) {
        // Calculate angles for ring rotation
        const startAngle = Math.atan2(startUnitY, startUnitX) * 180 / Math.PI
        
        // For end ring, use the calculated unit vectors
        const endAngle = Math.atan2(-endUnitY, -endUnitX) * 180 / Math.PI
        
        // Show and position start ring
        startRing.style.display = ''
        startRing.setAttribute('transform', `translate(${a.x}, ${a.y}) rotate(${startAngle})`)
        const startCircle = startRing.firstElementChild as SVGCircleElement
        const startTriangle = startRing.lastElementChild as SVGPathElement
        if (startCircle && startTriangle && color) {
          startCircle.setAttribute('stroke', color)
          startTriangle.setAttribute('stroke', color)
        }
        
        // Show and position end ring at cursor/end point
        endRing.style.display = ''
        endRing.setAttribute('transform', `translate(${endPoint.x}, ${endPoint.y}) rotate(${endAngle})`)
        const endCircle = endRing.firstElementChild as SVGCircleElement
        const endTriangle = endRing.lastElementChild as SVGPathElement
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
    shadowPath.setAttribute("stroke-opacity", "0.2")
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
    startCircle.setAttribute("stroke-opacity", String(opacityRef.current))
    startTriangle.setAttribute("stroke-opacity", String(opacityRef.current))
    startRing.setAttribute("class", "wire-start-ring")
    
    const endRing = document.createElementNS("http://www.w3.org/2000/svg", "g")
    const endCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
    endCircle.setAttribute("r", "10")
    endCircle.setAttribute("fill", "none")
    endCircle.setAttribute("stroke-width", "6")  // Extra thick ring
    endCircle.setAttribute("stroke-opacity", String(opacityRef.current))
    const endTriangle = document.createElementNS("http://www.w3.org/2000/svg", "path")
    // Rounded triangle tip using arc for smooth connection
    endTriangle.setAttribute("d", "M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7")
    endTriangle.setAttribute("fill", "none")
    endTriangle.setAttribute("stroke-width", "6")  // Extra thick triangle
    endTriangle.setAttribute("stroke-opacity", String(opacityRef.current))
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
    p.setAttribute("stroke-width", String(thicknessRef.current))
    
    // Position and style the triangular wire rings with rotation
    const startCircle = startRing.firstElementChild as SVGCircleElement
    const startTriangle = startRing.lastElementChild as SVGPathElement
    if (startCircle && startTriangle) {
      startCircle.setAttribute("stroke", color)
      startTriangle.setAttribute("stroke", color)
    }
    startRing.setAttribute("transform", `translate(${a.x}, ${a.y}) rotate(${result.startAngle})`)
    
    const endCircle = endRing.firstElementChild as SVGCircleElement
    const endTriangle = endRing.lastElementChild as SVGPathElement
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
          <feGaussianBlur stdDeviation="1" />
        </filter>
      </defs>

      {/* Temp wire with rings */}
      <g>
        {/* Temp start ring */}
        <g ref={tempStartRingRef} style={{ display: 'none' }}>
          <circle r="10" fill="none" strokeWidth="6" strokeOpacity={Number(settings.wireOpacity ?? 0.7)} />
          <path d="M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7" fill="none" strokeWidth="6" strokeOpacity={Number(settings.wireOpacity ?? 0.7)} />
        </g>
        
        {/* Temp end ring */}
        <g ref={tempEndRingRef} style={{ display: 'none' }}>
          <circle r="10" fill="none" strokeWidth="6" strokeOpacity={Number(settings.wireOpacity ?? 0.7)} />
          <path d="M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7" fill="none" strokeWidth="6" strokeOpacity={Number(settings.wireOpacity ?? 0.7)} />
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
