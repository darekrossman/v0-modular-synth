"use client";
import React, { useEffect, useMemo, useRef } from "react";
import { useConnections } from "./connection-provider";
import type { ConnectionEdge } from "./connection-types";


function pathForCable(a: {x:number;y:number}, b:{x:number;y:number}) {
const dx = b.x - a.x, dy = b.y - a.y; const dist = Math.hypot(dx, dy);
const sag = Math.min(dist * 0.45, 130); const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + sag;
return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
}


export default function WireOverlay() {
const { connections, getPortColor } = useConnections();
const svgRef = useRef<SVGSVGElement | null>(null);
const tempPath = useRef<SVGPathElement | null>(null);


// Expose a tiny imperative API to draw the temp wire without triggering React renders
const { beginDrag } = useConnections() as any;
useEffect(() => {
const ctx = (window as any).__wireTemp__ || ((window as any).__wireTemp__ = {});
ctx.updateTemp = (from: {x:number;y:number}, to: {x:number;y:number}|null) => {
if (!svgRef.current || !tempPath.current) return;
if (!to) { tempPath.current.setAttribute("d", ""); return; }
tempPath.current.setAttribute("d", pathForCable(from, to));
};
}, []);


// Render static wires (connections)
const items = useMemo(() => connections, [connections]);


return (
<svg ref={svgRef} className="pointer-events-none fixed inset-0 w-full h-full z-40" shapeRendering="optimizeSpeed">
<defs>
<filter id="wireGlow" x="-50%" y="-50%" width="200%" height="200%">
<feDropShadow stdDeviation="1.5" dx="0" dy="0" floodOpacity="0.7" />
</filter>
</defs>
{/* Temp wire path (rAF-updated) */}
<path ref={tempPath} stroke="#fff" strokeWidth="4" fill="none" strokeOpacity="0.9" />
{items.map((c: ConnectionEdge) => (
<StaticWire key={c.id} edge={c} color={getPortColor(c.from + c.to)} />
))}
</svg>
);
}


const portCenterCache = new Map<string, {x:number;y:number}>();
function getCenter(portId: string): {x:number;y:number} {
// This function expects ConnectionProviderV2's measurement loop to keep the cache fresh.
// For simplicity in this file, read from the same cache; you might inject it via context if preferred.
// Fallback to (0,0) if not yet measured.
return portCenterCache.get(portId) ?? { x: 0, y: 0 };
}


function StaticWire({ edge, color }: { edge: ConnectionEdge; color: string }) {
const a = getCenter(edge.from); const b = getCenter(edge.to);
const d = pathForCable(a, b);
const r = 3.5;
return (
<g filter="url(#wireGlow)">
<path d={d} stroke={color} strokeWidth="6" strokeOpacity="0.5" fill="none" />
<circle cx={a.x} cy={a.y} r={r} fill={color} />
<circle cx={b.x} cy={b.y} r={r} fill={color} />
</g>
);
}
