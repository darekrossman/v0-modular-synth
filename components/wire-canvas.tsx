'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSettings } from '@/components/settings-context'
import type { ConnectionEdge } from '@/lib/connection-types'
import { useConnections } from './connection-manager'

const cssEscape = (s: string) => {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s)
  return s.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

// Unified wire physics calculation
function calculateWirePhysics(
  dist: number,
  dx: number,
  dy: number,
  tension: number,
  shadowOffset: number = 0,
) {
  const slack = 1 - tension

  // For short distances, we need MUCH more extra wire
  // Use inverse relationship: shorter wires get proportionally more extra length
  const distanceFactor = Math.max(50, dist) // Minimum 50px for calculations
  const inverseBonus = 300 / distanceFactor // Bonus multiplier for short wires (6x at 50px, 1.5x at 200px)

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
  const gravityEffect = (1.0 - 0.3 * horizontalRatio) * slack // Scale gravity by slack

  return sag * gravityEffect + shadowOffset
}

function makeSagPath(
  droop: number,
  shadowOffset: number = 0,
  clipRadius: number = 0,
) {
  const d = Math.max(0, Math.min(1, droop))

  return (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): { path: string; startAngle: number; endAngle: number } => {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)

    // Use unified physics calculation
    const tension = 1 - d
    const sag = calculateWirePhysics(dist, dx, dy, tension, shadowOffset)

    // Gravity-aligned midpoint sag construction (direction-agnostic)
    // Compute sag amplitude (already in 'sag') along gravity g = (0, 1)
    const slack = 1 - tension
    const horizontalness = dist > 0 ? Math.abs(dx) / dist : 0
    const verticalness = 1.0 - horizontalness

    // Midpoint of chord
    const midx0 = (a.x + b.x) * 0.5
    const midy0 = (a.y + b.y) * 0.5
    // Apply sag downward in screen space
    const midx = midx0
    const midy = midy0 + sag

    // Build a quadratic that passes through (midx, midy) at t=0.5
    // Solve for quadratic control P1 so that B(0.5) = m
    const q1x = 2 * midx - 0.5 * (a.x + b.x)
    const q1y = 2 * midy - 0.5 * (a.y + b.y)

    // Convert quadratic (P0=a, P1=q1, P2=b) to cubic (C1, C2)
    const cp1x = a.x + (2 / 3) * (q1x - a.x)
    let cp1y = a.y + (2 / 3) * (q1y - a.y)
    const cp2x = b.x + (2 / 3) * (q1x - b.x)
    let cp2y = b.y + (2 / 3) * (q1y - b.y)

    // Endpoint lead-down bias to encourage downward tangents near rings
    // Scales with slack and verticalness, leaving horizontal runs mostly unchanged
    const leadBias = 0.35 * slack * verticalness
    if (leadBias > 0) {
      const biasAmount = leadBias * sag
      cp1y += biasAmount
      cp2y += biasAmount
    }

    // Always calculate tangent vectors and apply offsets consistently
    // At t=0, tangent points from start toward first control point
    const startTangentX = cp1x - a.x
    const startTangentY = cp1y - a.y
    const startTangentDist = Math.hypot(startTangentX, startTangentY)

    // At t=1, tangent points from second control point toward end
    const endTangentX = b.x - cp2x
    const endTangentY = b.y - cp2y
    const endTangentDist = Math.hypot(endTangentX, endTangentY)

    // Calculate unit vectors with continuous blending toward gravity to avoid flips
    let startUnitX, startUnitY, endUnitX, endUnitY
    const gx = 0,
      gy = 1
    const startBlend =
      Math.max(0, Math.min(1, (8 - startTangentDist) / 8)) * slack
    const endBlend = Math.max(0, Math.min(1, (8 - endTangentDist) / 8)) * slack

    // Blend start tangent toward gravity
    {
      const sx = (1 - startBlend) * startTangentX + startBlend * gx
      const sy = (1 - startBlend) * startTangentY + startBlend * gy
      const sLen = Math.hypot(sx, sy)
      if (sLen > 0.0001) {
        startUnitX = sx / sLen
        startUnitY = sy / sLen
      } else {
        startUnitX = 0
        startUnitY = 1
      }
    }

    // Blend end tangent toward gravity (incoming direction is b - cp2)
    {
      const ex = (1 - endBlend) * endTangentX + endBlend * gx
      const ey = (1 - endBlend) * endTangentY + endBlend * gy
      const eLen = Math.hypot(ex, ey)
      if (eLen > 0.0001) {
        endUnitX = ex / eLen
        endUnitY = ey / eLen
      } else {
        endUnitX = 0
        endUnitY = 1
      }
    }

    // Always apply offsets if clipRadius > 0
    let startPoint = a
    let endPoint = b

    if (clipRadius > 0) {
      startPoint = {
        x: a.x + startUnitX * clipRadius,
        y: a.y + startUnitY * clipRadius,
      }
      endPoint = {
        x: b.x - endUnitX * clipRadius,
        y: b.y - endUnitY * clipRadius,
      }

      // Adjust control points to maintain smooth curve
      const cp1xAdjusted = cp1x - startUnitX * clipRadius * 0.25
      const cp1yAdjusted = cp1y - startUnitY * clipRadius * 0.25
      const cp2xAdjusted = cp2x + endUnitX * clipRadius * 0.25
      const cp2yAdjusted = cp2y + endUnitY * clipRadius * 0.25

      // Calculate angles for ring rotation
      const startAngle = (Math.atan2(startUnitY, startUnitX) * 180) / Math.PI
      const endAngle = (Math.atan2(-endUnitY, -endUnitX) * 180) / Math.PI

      return {
        path: `M ${startPoint.x} ${startPoint.y} C ${cp1xAdjusted} ${cp1yAdjusted}, ${cp2xAdjusted} ${cp2yAdjusted}, ${endPoint.x} ${endPoint.y}`,
        startAngle,
        endAngle,
      }
    } else {
      // No clipping radius - wire goes directly to centers
      const startAngle = (Math.atan2(startUnitY, startUnitX) * 180) / Math.PI
      const endAngle = (Math.atan2(-endUnitY, -endUnitX) * 180) / Math.PI

      return {
        path: `M ${a.x} ${a.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${b.x} ${b.y}`,
        startAngle,
        endAngle,
      }
    }
  }
}

export function WireCanvas() {
  const { connections, registerTempWireUpdater, getPortCenter } =
    useConnections()
  const [, forceRender] = useState(0)

  const svgRef = useRef<SVGSVGElement | null>(null)
  const staticRingLayerRef = useRef<SVGGElement | null>(null)
  const staticWireLayerRef = useRef<SVGGElement | null>(null)
  const tempPathRef = useRef<SVGPathElement | null>(null)
  const tempShadowPathRef = useRef<SVGPathElement | null>(null)
  const tempColorRef = useRef<string>('#fff')
  const tempStartRingRef = useRef<SVGGElement | null>(null)
  const tempEndRingRef = useRef<SVGGElement | null>(null)
  const { settings } = useSettings()
  const tensionRef = useRef(0.5)
  const opacityRef = useRef(0.7)
  const thicknessRef = useRef(6)
  const sagPathRef = useRef<
    (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => { path: string; startAngle: number; endAngle: number }
  >(() => ({ path: '', startAngle: 0, endAngle: 0 }))

  // Keep latest tension and path factory without re-registering handlers
  useEffect(() => {
    const t = Number(settings.wireTension ?? 0.5)
    const clamped = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0.5
    tensionRef.current = clamped
    // Invert tension for sag calculation: high tension (1) = no sag (0), low tension (0) = max sag (1)
    const sag = 1 - clamped
    // Adjust clip radius based on tension - tighter wires need more offset for triangle tip
    const clipRadius = 13 + clamped * 2 // 13-15px based on tension
    sagPathRef.current = makeSagPath(sag, 0, clipRadius)
  }, [settings.wireTension])

  // Keep latest opacity in a ref for rAF-driven draws
  useEffect(() => {
    const o = Number(settings.wireOpacity ?? 0.7)
    opacityRef.current = Number.isFinite(o) ? Math.max(0, Math.min(1, o)) : 0.7
  }, [settings.wireOpacity])

  // Keep latest thickness in a ref for rAF-driven draws
  useEffect(() => {
    const t = Number(settings.wireThickness ?? 6)
    thicknessRef.current = Number.isFinite(t) ? Math.max(1, Math.min(10, t)) : 6
  }, [settings.wireThickness])

  const groupMap = useRef(new Map<string, SVGGElement>())
  const pathMap = useRef(new Map<string, SVGPathElement>())
  const connectionsRef = useRef<ConnectionEdge[]>([])

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
    // During active drags, DOM layout is authoritative; otherwise use cached geometry
    const el = document.querySelector<HTMLElement>(
      `[data-port-id="${cssEscape(portId)}"]`,
    )
    if (el) {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const cached = getPortCenter(portId)
    if (cached) return cached
    return null
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
        if (pathEl) pathEl.setAttribute('d', '')
        if (shadowPathEl) shadowPathEl.setAttribute('d', '')
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
      const shadowVerticalOffset = Math.min(15, dist * 0.05) // 5% of distance, max 15px
      const tension = tensionRef.current
      const clipRadius = 13 + tension * 2 // Same as main path
      const shadowSagPath = makeSagPath(
        1 - tension,
        shadowVerticalOffset,
        clipRadius,
      )
      const shadowResult = shadowSagPath(a, b)

      // Set the shadow path
      shadowPathEl.setAttribute('d', shadowResult.path)
      shadowPathEl.setAttribute('stroke-width', String(thicknessRef.current))

      // Set the wire path
      pathEl.setAttribute('d', result.path)
      pathEl.setAttribute('stroke-width', String(thicknessRef.current))

      if (color) {
        pathEl.setAttribute('stroke', color)
        tempColorRef.current = color
      }

      // Position and show temp wire rings
      if (startRing && endRing) {
        // Show and position start ring
        startRing.style.display = ''
        startRing.setAttribute(
          'transform',
          `translate(${a.x}, ${a.y}) rotate(${result.startAngle})`,
        )
        const startCircle = startRing.children[0] as SVGCircleElement
        const startTriangle = startRing.children[1] as SVGPathElement
        if (startCircle && startTriangle && color) {
          startCircle.setAttribute('stroke', color)
          startTriangle.setAttribute('stroke', color)
        }

        // Show and position end ring at cursor/end point
        endRing.style.display = ''
        endRing.setAttribute(
          'transform',
          `translate(${b.x}, ${b.y}) rotate(${result.endAngle})`,
        )
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
    const ringLayer = staticRingLayerRef.current
    const wireLayer = staticWireLayerRef.current
    if (!ringLayer || !wireLayer) return
    if (groupMap.current.has(edge.id)) return

    // Create ring group per edge
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('data-edge-id', edge.id)

    // Create end rings
    const startRing = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g',
    )
    const startCircle = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle',
    )
    startCircle.setAttribute('r', '10')
    startCircle.setAttribute('fill', 'none')
    startCircle.setAttribute('stroke-width', '5')
    const startTriangle = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
    startTriangle.setAttribute('d', 'M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7')
    startTriangle.setAttribute('fill', 'none')
    startTriangle.setAttribute('stroke-width', '5')
    startCircle.setAttribute('stroke-opacity', '1')
    startTriangle.setAttribute('stroke-opacity', '1')
    // Inner circle with white outline
    const startInner = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle',
    )
    startInner.setAttribute('r', '7')
    startInner.setAttribute('fill', 'none')
    startInner.setAttribute('stroke', '#fff')
    startInner.setAttribute('stroke-width', '2')
    startInner.setAttribute('vector-effect', 'non-scaling-stroke')
    startRing.appendChild(startCircle)
    startRing.appendChild(startTriangle)
    startRing.appendChild(startInner)
    startRing.setAttribute('class', 'wire-start-ring')

    const endRing = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    const endCircle = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle',
    )
    endCircle.setAttribute('r', '10')
    endCircle.setAttribute('fill', 'none')
    endCircle.setAttribute('stroke-width', '5')
    endCircle.setAttribute('stroke-opacity', '1')
    const endTriangle = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
    endTriangle.setAttribute('d', 'M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7')
    endTriangle.setAttribute('fill', 'none')
    endTriangle.setAttribute('stroke-width', '5')
    endTriangle.setAttribute('stroke-opacity', '1')
    // Inner circle with white outline
    const endInner = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'circle',
    )
    endInner.setAttribute('r', '7')
    endInner.setAttribute('fill', 'none')
    endInner.setAttribute('stroke', '#fff')
    endInner.setAttribute('stroke-width', '2')
    endInner.setAttribute('vector-effect', 'non-scaling-stroke')
    endRing.appendChild(endCircle)
    endRing.appendChild(endTriangle)
    endRing.appendChild(endInner)
    endRing.setAttribute('class', 'wire-end-ring')

    g.appendChild(startRing)
    g.appendChild(endRing)
    ringLayer.appendChild(g)

    // Create wire paths in wire layer
    const shadowPath = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
    shadowPath.setAttribute('fill', 'none')
    shadowPath.setAttribute('stroke', 'black')
    shadowPath.setAttribute('stroke-width', String(thicknessRef.current))
    shadowPath.setAttribute('stroke-opacity', String(0.15 * opacityRef.current))
    shadowPath.setAttribute('stroke-linecap', 'round')
    shadowPath.setAttribute('vector-effect', 'non-scaling-stroke')
    shadowPath.setAttribute('filter', 'url(#wireShadowBlur)')

    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('fill', 'none')
    p.setAttribute('stroke-width', '6')
    p.setAttribute('stroke-opacity', String(opacityRef.current))
    p.setAttribute('stroke-linecap', 'round')
    p.setAttribute('vector-effect', 'non-scaling-stroke')

    // Ensure shadow behind wire within the wire layer
    wireLayer.appendChild(shadowPath)
    wireLayer.appendChild(p)

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
        } catch {}
        const p = pathMap.current.get(id)
        const sp = shadowPathMap.current.get(id)
        try {
          p?.remove()
        } catch {}
        try {
          sp?.remove()
        } catch {}
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
      p.setAttribute('d', '')
      shadowPath.setAttribute('d', '')
      startRing.setAttribute('transform', 'translate(-1000, -1000)')
      endRing.setAttribute('transform', 'translate(-1000, -1000)')
      return
    }

    const a = toSvg(aScr)
    const b = toSvg(bScr)

    // Wire with path and angles
    const result = sagPathRef.current(a, b)

    // Create shadow path with additional vertical offset
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    const shadowVerticalOffset = Math.min(15, dist * 0.05) // 5% of distance, max 15px
    const tension = tensionRef.current
    const clipRadius = 13 + tension * 2 // Same as main path
    const shadowSagPath = makeSagPath(
      1 - tension,
      shadowVerticalOffset,
      clipRadius,
    )
    const shadowResult = shadowSagPath(a, b)

    const color = pickColor(edge)

    // Set shadow path
    shadowPath.setAttribute('d', shadowResult.path)
    shadowPath.setAttribute('stroke-width', String(thicknessRef.current)) // Same thickness as wire

    // Set main wire path
    p.setAttribute('d', result.path)
    p.setAttribute('stroke', color)
    const opacity = opacityRef.current
    p.setAttribute('stroke-opacity', String(opacity))
    shadowPath.setAttribute('stroke-opacity', String(0.15 * opacity))
    p.setAttribute('stroke-width', String(thicknessRef.current))

    // Position and style the triangular wire rings with rotation
    const startCircle = startRing.children[0] as SVGCircleElement
    const startTriangle = startRing.children[1] as SVGPathElement
    if (startCircle && startTriangle) {
      startCircle.setAttribute('stroke', color)
      startTriangle.setAttribute('stroke', color)
    }
    startRing.setAttribute(
      'transform',
      `translate(${a.x}, ${a.y}) rotate(${result.startAngle})`,
    )

    const endCircle = endRing.children[0] as SVGCircleElement
    const endTriangle = endRing.children[1] as SVGPathElement
    if (endCircle && endTriangle) {
      endCircle.setAttribute('stroke', color)
      endTriangle.setAttribute('stroke', color)
    }
    endRing.setAttribute(
      'transform',
      `translate(${b.x}, ${b.y}) rotate(${result.endAngle})`,
    )
  }

  const tick = () => {
    const now = performance.now()
    const edges = connectionsRef.current
    for (let i = 0; i < edges.length; i++) drawEdge(edges[i])
    if (now < settleUntil.current) {
      rafId.current = requestAnimationFrame(tick)
    } else {
      rafId.current = null
    }
  }

  // Allow external, non-React-driven refresh without causing rerenders
  useEffect(() => {
    const onRefresh = () => {
      settleUntil.current = performance.now() + 50
      if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
      forceRender((n: number) => (n + 1) & 0xffff)
    }
    window.addEventListener('wires:refresh', onRefresh as EventListener)
    // Also respond to resize/scroll to keep wires glued while dragging
    const onResizeOrScroll = () => {
      settleUntil.current = performance.now() + 50
      if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
      forceRender((n: number) => (n + 1) & 0xffff)
    }
    window.addEventListener('resize', onResizeOrScroll, { passive: true })
    window.addEventListener('scroll', onResizeOrScroll, {
      capture: true,
      passive: true,
    })
    return () => {
      window.removeEventListener('wires:refresh', onRefresh as EventListener)
      window.removeEventListener('resize', onResizeOrScroll as any)
      window.removeEventListener('scroll', onResizeOrScroll as any, true)
    }
  }, [])

  // Build DOM for edges when list changes; update ref and start settle window
  useEffect(() => {
    connectionsRef.current = connections
    const present = new Set<string>()
    for (const edge of connections) {
      present.add(edge.id)
      ensureEdgeDom(edge)
    }
    pruneMissingEdges(present)
    settleUntil.current = performance.now() + 10
    if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections])

  // Also refresh on settings changes
  useEffect(() => {
    settleUntil.current = performance.now() + 10
    if (rafId.current == null) rafId.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.wireTension, settings.wireOpacity, settings.wireThickness])

  useEffect(() => {
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      groupMap.current.forEach((g) => {
        try {
          g.remove()
        } catch {}
      })
      pathMap.current.forEach((p) => {
        try {
          p.remove()
        } catch {}
      })
      shadowPathMap.current.forEach((sp) => {
        try {
          sp.remove()
        } catch {}
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
    <svg
      ref={svgRef}
      className="pointer-events-none absolute top-0 left-0 w-full h-full z-40"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <filter
          id="wireShadowBlur"
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feGaussianBlur stdDeviation="0" />
        </filter>
      </defs>

      {/* Temp wire with rings */}
      <g>
        {/* Temp wire shadow (rendered first) */}
        <path
          ref={tempShadowPathRef}
          stroke="black"
          strokeWidth={Math.max(
            1,
            Math.min(10, Number(settings.wireThickness ?? 6)),
          )}
          fill="none"
          strokeOpacity={String(0.15 * opacityRef.current)}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          filter="url(#wireShadowBlur)"
        />

        {/* Temp start ring */}
        <g ref={tempStartRingRef} style={{ display: 'none' }}>
          <circle r="10" fill="none" strokeWidth="5" strokeOpacity={1} />
          <path
            d="M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7"
            fill="none"
            strokeWidth="6"
            strokeOpacity={1}
          />
          <circle
            r="7"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* Temp end ring */}
        <g ref={tempEndRingRef} style={{ display: 'none' }}>
          <circle r="10" fill="none" strokeWidth="5" strokeOpacity={1} />
          <path
            d="M 7,-7 L 14,-2 A 2,2 0 0,1 14,2 L 7,7"
            fill="none"
            strokeWidth="6"
            strokeOpacity={1}
          />
          <circle
            r="7"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* Temp wire path (must be above temp rings, so moved after rings) */}
        <path
          ref={tempPathRef}
          stroke={tempColorRef.current}
          strokeWidth={Math.max(
            1,
            Math.min(10, Number(settings.wireThickness ?? 6)),
          )}
          fill="none"
          strokeOpacity={Number(settings.wireOpacity ?? 0.7)}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>

      {/* Static layers: rings first, wires above */}
      <g ref={staticRingLayerRef} />
      <g ref={staticWireLayerRef} />

      {/* Hidden keyed list keeps React aware of edges */}
      {/* Hidden keyed list was causing re-render churn during drag; remove to keep DOM stable */}
    </svg>
  )
}
