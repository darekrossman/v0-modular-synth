// port.tsx
"use client"

import { useCallback, useMemo, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { TextLabel } from "./text-label"
import { useConnections } from "./connection-manager" 

type PortKind = "audio" | "cv" | "any"

export interface PortProps {
  id: string
  type: "input" | "output"
  label: string
  // ⬇️ add "any"
  audioType: "audio" | "cv" | "gate" | "trig" | "any"
  audioNode?: AudioNode
  className?: string
}

export function Port({ id, type, label, audioType, audioNode, className }: PortProps) {
  const { registerPort, unregisterPort, registerAudioNode, beginDrag, updateDrag, endDrag } = useConnections()
  const nodeRef = useRef<HTMLDivElement | null>(null)

  // ⬇️ map to connection-manager kind, treating "any" as "any"
  const kind: PortKind = useMemo(() => {
    if (audioType === "any") return "any"
    return audioType === "audio" ? "audio" : "cv" // gate/trig treated as cv
  }, [audioType])

  // Register AudioNode (safe if undefined early)
  useEffect(() => {
    if (audioNode) {
      // If your registerAudioNode takes only (id, node), the extra arg is ignored
      // If it takes (id, node, direction), this still works.
      // @ts-ignore - support both signatures
      registerAudioNode(id, audioNode, type)
    }
  }, [id, type, audioNode, registerAudioNode])

  // Callback ref guarantees we only register with a real Element
  const setNodeRef = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      nodeRef.current = el
      // NOTE: moduleId derivation: "<moduleId>-<port-name...>"
      const moduleId = id.split("-").slice(0, -2).join("-") || id
      // @ts-ignore support both registerPort shapes
      registerPort(
        // Some apps expect (meta, el); others expect (id, meta)
        // We pass (id, meta) here as per your current app usage.
        id,
        {
          el,                 // must be an Element for ResizeObserver
          direction: type,    // "input" | "output"
          kind,               // "audio" | "cv" | "any"
          moduleId,
        }
      )
    } else {
      unregisterPort(id)
      nodeRef.current = null
    }
  }, [id, type, kind, registerPort, unregisterPort])

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    beginDrag(id, e.clientX, e.clientY)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      updateDrag(e.clientX, e.clientY)
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const elAtPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const toId = elAtPoint?.closest("[data-port-id]")?.getAttribute("data-port-id") || undefined
    endDrag(toId)
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
  }

  return (
    <div className={cn("flex flex-col items-center gap-1 h-[54px] px-1 pt-2 pb-0.5 w-11 bg-neutral-700 rounded-xs", className)}>
      <div
        ref={setNodeRef}
        data-port-id={id}
        data-port-kind={kind}           // ⬅️ helpful in DevTools
        className="w-5 h-5 rounded-full bg-neutral-900 border-2 border-neutral-400 shadow-[0_1px_0_0_rgba(0,0,0,0.3)] cursor-pointer hover:scale-110 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <TextLabel>{label}</TextLabel>
    </div>
  )
}
