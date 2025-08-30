"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { ModuleContainer } from "./module-container"
import { Knob } from "@/components/ui/knob"
import { Port } from "./port"
import { mapLinear } from "@/lib/utils"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

export function RandomModule({ moduleId }: { moduleId: string }) {
  const [atten, setAtten] = useState([[1], [1], [1], [1], [1], [1]] as number[][])
  const [offset, setOffset] = useState([[0.5], [0.5], [0.5], [0.5], [0.5], [0.5]] as number[][])

  const audioContextRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)

  const trigIn1Ref = useRef<GainNode | null>(null)
  const trigIn2Ref = useRef<GainNode | null>(null)
  const trigIn3Ref = useRef<GainNode | null>(null)
  const trigIn4Ref = useRef<GainNode | null>(null)
  const trigIn5Ref = useRef<GainNode | null>(null)
  const trigIn6Ref = useRef<GainNode | null>(null)
  const trigIn = [trigIn1Ref, trigIn2Ref, trigIn3Ref, trigIn4Ref, trigIn5Ref, trigIn6Ref]

  const cvOut1Ref = useRef<GainNode | null>(null)
  const cvOut2Ref = useRef<GainNode | null>(null)
  const cvOut3Ref = useRef<GainNode | null>(null)
  const cvOut4Ref = useRef<GainNode | null>(null)
  const cvOut5Ref = useRef<GainNode | null>(null)
  const cvOut6Ref = useRef<GainNode | null>(null)
  const cvOut = [cvOut1Ref, cvOut2Ref, cvOut3Ref, cvOut4Ref, cvOut5Ref, cvOut6Ref]

  const isInitializedRef = useRef(false)

  const paramName = (kind: "atten" | "offset", idx: number) => `${kind}${idx + 1}` as const

  const setAttenIdx = (idx: number) => (v: number[]) => {
    setAtten((prev) => {
      const next = [...prev]
      next[idx] = v
      return next
    })
    const ac = audioContextRef.current
    const node = workletRef.current
    if (ac && node) {
      node.parameters.get(paramName("atten", idx))?.setValueAtTime(v[0] ?? 0, ac.currentTime)
    }
  }

  const setOffsetIdx = (idx: number) => (v: number[]) => {
    // map 0..1 -> -5..+5
    const volts = mapLinear(v[0] ?? 0, -5, 5)
    setOffset((prev) => {
      const next = [...prev]
      next[idx] = v
      return next
    })
    const ac = audioContextRef.current
    const node = workletRef.current
    if (ac && node) {
      node.parameters.get(paramName("offset", idx))?.setValueAtTime(volts, ac.currentTime)
    }
  }

  const init = useCallback(async () => {
    if (isInitializedRef.current) return
    const ac = getAudioContext()
    audioContextRef.current = ac

    // Load the worklet file you added above
    await ac.audioWorklet.addModule("/random-processor.js")

    const node = new AudioWorkletNode(ac, "random-processor", {
      numberOfInputs: 6,
      numberOfOutputs: 6,
      outputChannelCount: [1, 1, 1, 1, 1, 1],
      // seed params with current GUI state
      parameterData: {
        atten1: atten[0][0],
        offset1: mapLinear(offset[0][0], -5, 5),
        atten2: atten[1][0],
        offset2: mapLinear(offset[1][0], -5, 5),
        atten3: atten[2][0],
        offset3: mapLinear(offset[2][0], -5, 5),
        atten4: atten[3][0],
        offset4: mapLinear(offset[3][0], -5, 5),
        atten5: atten[4][0],
        offset5: mapLinear(offset[4][0], -5, 5),
        atten6: atten[5][0],
        offset6: mapLinear(offset[5][0], -5, 5),
      },
    })
    workletRef.current = node

    // Create ports: triggers (inputs)
    for (let i = 0; i < 6; i++) {
      const gIn = ac.createGain()
      gIn.gain.value = 1
      trigIn[i].current = gIn
      // connect trigger inputs into the worklet inputs
      gIn.connect(node, 0, i)
    }

    // Create outputs and register; drive them from the worklet outputs
    for (let i = 0; i < 6; i++) {
      const gOut = ac.createGain()
      gOut.gain.value = 1
      node.connect(gOut, i, 0)
      cvOut[i].current = gOut
    }

    // Keep-alive: ensure processing even with no external connections
    const sink = ac.createGain()
    sink.gain.value = 0
    cvOut[0].current!.connect(sink)
    sink.connect(ac.destination)

    isInitializedRef.current = true
  }, [moduleId])

  useEffect(() => {
    init()
    return () => {
      try {
        for (let i = 0; i < 6; i++) {
          trigIn[i].current?.disconnect()
          cvOut[i].current?.disconnect()
        }
        workletRef.current?.disconnect()
      } catch {}
    }
  }, [init])

  return (
    <ModuleContainer title="Random" moduleId={moduleId}>
      <div className="flex flex-col flex-1 justify-between gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 p-1.5 rounded-xs bg-black/10">
            <Port
              id={`${moduleId}-trigger-in-${i + 1}`}
              type="input"
              label="Trig"
              audioType="cv"
              audioNode={trigIn[i].current ?? undefined}
            />
            <Knob defaultValue={atten[i]} onValueChange={setAttenIdx(i)} label="Level" size="sm" />
            <Knob defaultValue={offset[i]} onValueChange={setOffsetIdx(i)} label="Offset" size="sm" />
            <Port
              id={`${moduleId}-cv-out-${i + 1}`}
              type="output"
              label={`CV${i + 1}`}
              audioType="cv"
              audioNode={cvOut[i].current ?? undefined}
            />
          </div>
        ))}
      </div>
    </ModuleContainer>
  )
}
