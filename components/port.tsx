// port.tsx
"use client"

import { useCallback, useMemo, useRef, useEffect, useState } from "react"
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
  indicator?: boolean
}

// Convert voltage (-5 to +5) to RGB color
function voltageToColor(voltage: number): string {
  // Clamp voltage to -5 to +5 range
  const v = Math.max(-5, Math.min(5, voltage))

  if (v > 0) {
    // Positive voltage: gray to green (0 to +5)
    const ratio = v / 5
    const r = Math.round(128 * (1 - ratio))
    const g = Math.round(128 + 127 * ratio)
    const b = Math.round(128 * (1 - ratio))
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Negative voltage: gray to red (0 to -5)
    const ratio = Math.abs(v) / 5
    const r = Math.round(128 + 127 * ratio)
    const g = Math.round(128 * (1 - ratio))
    const b = Math.round(128 * (1 - ratio))
    return `rgb(${r}, ${g}, ${b})`
  }
}

export function Port({ id, type, label, audioType, audioNode, className, indicator = true }: PortProps) {
  const { registerPort, unregisterPort, registerAudioNode, beginDrag, updateDrag, endDrag } = useConnections()
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const [signalValue, setSignalValue] = useState(0)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Force disable indicator for audio ports
  const showIndicator = indicator && audioType !== 'audio'

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

  // Monitor signal value if indicator is enabled
  useEffect(() => {
    if (!showIndicator || !audioNode) return

    const audioContext = audioNode.context as AudioContext

    // Create analyzer node
    const analyzer = audioContext.createAnalyser()
    analyzer.fftSize = 256
    analyzer.smoothingTimeConstant = 0 // No smoothing for fast response

    // Connect to the audio node
    audioNode.connect(analyzer)
    analyzerRef.current = analyzer

    // Create data array for time domain data
    const dataArray = new Float32Array(analyzer.fftSize)

    // Animation loop to read signal values
    const updateSignal = () => {
      if (!analyzerRef.current) return

      // Get time domain data
      analyzerRef.current.getFloatTimeDomainData(dataArray)

      // Calculate RMS value of the signal
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)

      // Get the instantaneous value (for CV signals)
      // Use the first sample as representative of DC offset
      const instantValue = dataArray[0] * 5 // Scale to -5 to +5V range

      // For CV signals, use instantaneous; for audio, use RMS
      const value = audioType === 'cv' || audioType === 'gate' || audioType === 'trig'
        ? instantValue
        : rms * 10 // Scale RMS for visibility

      setSignalValue(value)

      animationFrameRef.current = requestAnimationFrame(updateSignal)
    }

    updateSignal()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (analyzerRef.current) {
        try {
          audioNode.disconnect(analyzerRef.current)
        } catch { }
        analyzerRef.current = null
      }
    }
  }, [showIndicator, audioNode, audioType])

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
      ; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
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
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { }
  }

  return (
    <div className={cn("flex flex-col items-center gap-1 h-[54px] px-1 pt-2 pb-0.5 w-11 bg-neutral-400 rounded-sm relative", className)}>
      {showIndicator && (
        <div
          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full shadow-sm"
          style={{
            backgroundColor: voltageToColor(signalValue),
            boxShadow: `0 0 3px ${voltageToColor(signalValue)}`
          }}
        />
      )}
      <div
        ref={setNodeRef}
        data-port-id={id}
        data-port-kind={kind}
        className="w-5 h-5 shrink-0 rounded-full border-3 bg-neutral-300 border-neutral-900 cursor-pointer hover:scale-110 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <TextLabel>{label}</TextLabel>
    </div>
  )
}
