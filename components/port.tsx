// port.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useConnections } from './connection-manager'
import { TextLabel } from './text-label'

type PortKind = 'audio' | 'cv' | 'any'

export interface PortProps {
  id: string
  type: 'input' | 'output'
  label?: string
  audioType: 'audio' | 'cv' | 'gate' | 'trig' | 'any'
  audioNode?: AudioNode
  className?: string
  indicator?: boolean
}

function voltageToColor(voltage: number, isGateOrTrigger?: boolean): string {
  const v = Math.max(-10, Math.min(10, voltage))

  if (isGateOrTrigger) {
    if (v > 2.5) {
      return `rgba(0, 255, 0, 1)`
    } else {
      return `rgba(0, 0, 0, 1)`
    }
  }

  if (v > 0) {
    const ratio = v / 10
    return `rgba(0, 255, 0, ${ratio})`
  } else {
    const ratio = Math.abs(v) / 10
    return `rgba(255, 0, 0, ${ratio})`
  }
}

export function Port({
  id,
  type,
  label,
  audioType,
  audioNode,
  className,
  indicator = true,
}: PortProps) {
  const {
    registerPort,
    unregisterPort,
    registerAudioNode,
    beginDrag,
    updateDrag,
    endDrag,
    getConnectedWireColor,
    getDragColor,
    connections,
  } = useConnections()
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const [signalValue, setSignalValue] = useState(0)
  const [wireColor, setWireColor] = useState<string | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Force disable indicator for audio ports
  const showIndicator = indicator

  // Update wire color when connections change or when dragging
  useEffect(() => {
    const dragColor = getDragColor(id)
    if (dragColor) {
      setWireColor(dragColor)
    } else {
      const connectedColor = getConnectedWireColor(id)
      setWireColor(connectedColor)
    }
  }, [id, getConnectedWireColor, getDragColor, connections])

  // ⬇️ map to connection-manager kind, treating "any" as "any"
  const kind: PortKind = useMemo(() => {
    if (audioType === 'any') return 'any'
    return audioType === 'audio' ? 'audio' : 'cv' // gate/trig treated as cv
  }, [audioType])

  // Register AudioNode (safe if undefined early)
  useEffect(() => {
    if (audioNode) {
      // If your registerAudioNode takes only (id, node), the extra arg is ignored
      // If it takes (id, node, direction), this still works.
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
      // CV signals are already in voltage range (modules output actual voltages)
      const instantValue = dataArray[0]

      // For CV signals, use instantaneous; for audio, use RMS
      const value =
        audioType === 'cv' ||
        audioType === 'gate' ||
        audioType === 'trig' ||
        audioType === 'any' ||
        audioType === 'audio'
          ? instantValue
          : rms * 5 // Scale RMS for visibility

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
        } catch {}
        analyzerRef.current = null
      }
    }
  }, [showIndicator, audioNode, audioType])

  // Callback ref guarantees we only register with a real Element
  const setNodeRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) {
        nodeRef.current = el
        // NOTE: moduleId derivation: "<moduleId>-<port-name...>"
        const moduleId = id.split('-').slice(0, -2).join('-') || id
        registerPort(
          // Some apps expect (meta, el); others expect (id, meta)
          // We pass (id, meta) here as per your current app usage.
          id,
          {
            el, // must be an Element for ResizeObserver
            direction: type, // "input" | "output"
            kind, // "audio" | "cv" | "any"
            moduleId,
          },
        )
      } else {
        unregisterPort(id)
        nodeRef.current = null
      }
    },
    [id, type, kind, registerPort, unregisterPort],
  )

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
    const elAtPoint = document.elementFromPoint(
      e.clientX,
      e.clientY,
    ) as HTMLElement | null
    const toId =
      elAtPoint?.closest('[data-port-id]')?.getAttribute('data-port-id') ||
      undefined
    endDrag(toId)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {}
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1 relative',
        {
          'size-10': !label,
          'w-10 h-12': label,
        },
        className,
      )}
    >
      {label && <TextLabel>{label}</TextLabel>}
      <div
        ref={setNodeRef}
        data-port-id={id}
        data-port-kind={kind}
        className={cn(
          'relative size-[27px] shrink-0 rounded-full cursor-pointer select-none bg-port-jack-outer-ring border-red-500 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_3px_0_0_rgba(0,0,0,0.25)]',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className={`absolute inset-[3px] border border-black/50 rounded-full shadow-[inset_0_1px_0_0px_rgba(255,255,255,0.4),0_1px_0_0_rgba(0,0,0,0.5)] ${!wireColor ? 'dark:bg-port-jack-inner-ring' : 'bg-black'}`}
        />

        {wireColor ? (
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
            style={{
              backgroundColor: voltageToColor(
                signalValue,
                ['gate', 'trigger'].includes(audioType),
              ),
              boxShadow: `0 0 3px ${voltageToColor(
                signalValue,
                ['gate', 'trigger'].includes(audioType),
              )}`,
            }}
          />
        ) : (
          <div className="absolute inset-[7px] rounded-full bg-black" />
        )}
      </div>
    </div>
  )
}

export const PortGroup = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-sm bg-module-foreground text-module-background',
        className,
      )}
    >
      {children}
    </div>
  )
}
