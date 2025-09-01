"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ModuleContainer } from "./module-container"
import { PushButton } from "@/components/ui/push-button"
import { Toggle } from "@/components/ui/toggle"
import { Knob } from "@/components/ui/knob"
import { Port } from "./port"
import { mapLinear } from "@/lib/utils"
import { useModuleInit } from "@/hooks/use-module-init"
import { useModulePatch } from "./patch-manager"
import { TextLabel } from "./text-label"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

export function SequencerModule({ moduleId }: { moduleId: string }) {
  const STEPS = 16

  const defaultStepPattern = [
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
    true,
    false,
  ]

  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    steps: stepsRef.current,
    pitches: pitchesRef.current,
    octave: octaveRef.current[0],
    clockDiv: clockDivRef.current[0],
    gateRatio: gateRatioRef.current[0],
  }))

  const [steps, setSteps] = useState<boolean[]>(initialParameters?.steps ?? defaultStepPattern)
  const [currentStep, setCurrentStep] = useState(-1)

  // mirrors/refs
  const stepsRef = useRef<boolean[]>(initialParameters?.steps ?? defaultStepPattern)
  const pitchesRef = useRef<number[]>(initialParameters?.pitches ?? new Array(STEPS).fill(0.5))
  const octaveRef = useRef<number[]>([initialParameters?.octave ?? 0.375]) // normalized; 0.375 → octave 3
  const clockDivRef = useRef<number[]>([initialParameters?.clockDiv ?? 0]) // divider
  const gateRatioRef = useRef<number[]>([initialParameters?.gateRatio ?? 0.25]) // 25% of step by default

  // audio nodes
  const audioContextRef = useRef<AudioContext | null>(null)
  const clockInRef = useRef<GainNode | null>(null)
  const resetInRef = useRef<GainNode | null>(null)
  const gateOutRef = useRef<GainNode | null>(null)
  const pitchOutRef = useRef<GainNode | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const keepAliveRefs = useRef<{ gate: GainNode | null; pitch: GainNode | null }>({ gate: null, pitch: null })
  const lastDivIdxRef = useRef<number>(-1)
  const latestStepRef = useRef<number>(-1)

  useModuleInit(async () => {
    if (nodeRef.current) return
    const ac = getAudioContext()
    audioContextRef.current = ac

    clockInRef.current = ac.createGain()
    clockInRef.current.gain.value = 1

    resetInRef.current = ac.createGain()
    resetInRef.current.gain.value = 1

    await ac.audioWorklet.addModule("/sequencer-processor.js")

    const divValues = [1, 2, 4, 8, 16, 32, 64]
    const node = new AudioWorkletNode(ac, "sequencer-processor", {
      numberOfInputs: 2,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      parameterData: {
        run: 1, // always running by default
        divider: divValues[Math.max(0, Math.min(divValues.length - 1, Math.round((clockDivRef.current[0] || 0) * (divValues.length - 1))))],
        gateRatio: gateRatioRef.current[0],
        octave: octaveRef.current[0], // worklet accepts normalized or absolute
      },
    })
    nodeRef.current = node

    clockInRef.current.connect(node, 0, 0)
    resetInRef.current.connect(node, 0, 1)

    const gateOut = ac.createGain()
    gateOut.gain.value = 1
    const pitchOut = ac.createGain()
    pitchOut.gain.value = 1
    node.connect(gateOut, 0, 0)
    node.connect(pitchOut, 1, 0)
    gateOutRef.current = gateOut
    pitchOutRef.current = pitchOut

    const gateSink = ac.createGain()
    gateSink.gain.value = 0
    const pitchSink = ac.createGain()
    pitchSink.gain.value = 0
    gateOut.connect(gateSink)
    gateSink.connect(ac.destination)
    pitchOut.connect(pitchSink)
    pitchSink.connect(ac.destination)
    keepAliveRefs.current = { gate: gateSink, pitch: pitchSink }

    // Ensure initial steps reflect UI defaults so gates/pitches start immediately
    stepsRef.current = steps
    node.port.postMessage({ type: "steps", value: stepsRef.current })
    node.port.postMessage({ type: "pitches", value: pitchesRef.current })

    node.port.onmessage = (e) => {
      const { type, value } = e.data || {}
      if (type === "step") {
        const idx = typeof value === 'number' ? value : -1
        latestStepRef.current = idx
      }
    }
  }, moduleId)

  // Frame-synced step indicator: show the latest reported step once per rAF
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const v = latestStepRef.current
      setCurrentStep((prev) => (v !== prev ? v : prev))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleReset = useCallback(() => {
    const node = nodeRef.current
    if (node) {
      node.port.postMessage({ type: "reset" })
      setCurrentStep(-1)
    }
  }, [])

  const handleClockDividerChange = useCallback((value: number[]) => {
    const divValues = [1, 2, 4, 8, 16, 32, 64]
    const idx = Math.max(0, Math.min(divValues.length - 1, Math.round((value[0] || 0) * (divValues.length - 1))))
    if (idx === lastDivIdxRef.current) {
      clockDivRef.current = [value[0]]
      return
    }
    lastDivIdxRef.current = idx
    const next = divValues[idx]
    clockDivRef.current = [value[0]] // store knob position (0..1)
    const ac = audioContextRef.current
    const node = nodeRef.current
    if (ac && node) node.parameters.get("divider")?.setValueAtTime(next, ac.currentTime)
  }, [])

  const handleOctaveChange = useCallback((value: number[]) => {
    // store knob position (0..1); worklet can resolve normalized directly
    octaveRef.current = [value[0]]
    const ac = audioContextRef.current
    const node = nodeRef.current
    if (ac && node) node.parameters.get("octave")?.setValueAtTime(value[0], ac.currentTime)
  }, [])

  const handleGateRatioChange = useCallback((value: number[]) => {
    // 0..1 → 0..1 (identity via mapLinear to match your helper)
    const ratio = mapLinear(value[0], 0, 1)
    gateRatioRef.current = [value[0]]
    const ac = audioContextRef.current
    const node = nodeRef.current
    if (ac && node) node.parameters.get("gateRatio")?.setValueAtTime(ratio, ac.currentTime)
  }, [])

  const handleStepToggle = useCallback((i: number) => {
    setSteps((prev) => {
      const next = [...prev]
      next[i] = !next[i]
      stepsRef.current = next
      nodeRef.current?.port.postMessage({ type: "steps", value: next })
      return next
    })
  }, [])

  const handlePitchChange = useCallback((i: number, value: number[]) => {
    const v = Math.max(0, Math.min(1, value[0] ?? 0.5))
    pitchesRef.current[i] = v
    nodeRef.current?.port.postMessage({ type: "pitches", value: pitchesRef.current })
  }, [])

  return (
    <ModuleContainer title="Step Sequencer" moduleId={moduleId}>
      <div className="flex items-start gap-5">
        <div className="flex items-center gap-2">
          <Port
            id={`${moduleId}-clock-in`}
            type="input"
            label="CLK"
            audioType="cv"
            audioNode={clockInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-reset-in`}
            type="input"
            label="Reset"
            audioType="cv"
            audioNode={resetInRef.current ?? undefined}
          />
        </div>

        <div className="flex justify-between items-start flex-1">
          <PushButton onClick={handleReset} label="reset" size="sm" />

          <div className="flex items-center justify-center gap-8">
            <Knob
              defaultValue={clockDivRef.current}
              onValueChange={handleClockDividerChange}
              size="sm"
              label="Div"
              tickLabels={["1", "2", "4", "8", "16", "32", "64"]}
              steps={7}
            />
            <Knob
              defaultValue={octaveRef.current}
              onValueChange={handleOctaveChange}
              size="sm"
              label="Oct"
              tickLabels={[0, 1, 2, 3, 4, 5, 6, 7, 8]}
              steps={9}
            />
            <Knob defaultValue={gateRatioRef.current} onValueChange={handleGateRatioChange} size="sm" label="Gate" />
          </div>

          <div className="w-5" />
        </div>

        <div className="flex items-center gap-2">
          <Port
            id={`${moduleId}-gate-out`}
            type="output"
            label="GATE"
            audioType="cv"
            audioNode={gateOutRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-pitch-out`}
            type="output"
            label="PITCH"
            audioType="cv"
            audioNode={pitchOutRef.current ?? undefined}
          />
        </div>
      </div>

      <div className="flex-grow" />

      {/* Steps */}
      <div className="flex gap-1.5">
        {steps.map((active, idx) => (
          <div key={idx} className="flex flex-col items-center gap-2 min-w-[32px]">
            <div className="flex flex-col items-center gap-1">
              <TextLabel variant="control" className="">{idx + 1}</TextLabel>
              <Toggle
                pressed={active}
                active={currentStep === idx}
                onPressedChange={() => handleStepToggle(idx)}
              />
            </div>
            <Knob defaultValue={[pitchesRef.current[idx]]} onValueChange={(v) => handlePitchChange(idx, v)} size="xs" />
          </div>
        ))}
      </div>
    </ModuleContainer>
  )
}
