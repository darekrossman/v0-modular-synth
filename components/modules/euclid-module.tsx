'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'

// UI helper to compute Euclidean pattern for preview
function euclidPattern(
  steps: number,
  pulses: number,
  rotate: number,
): boolean[] {
  steps = Math.max(1, Math.floor(steps))
  pulses = Math.max(0, Math.min(steps, Math.floor(pulses)))
  rotate = Math.max(0, Math.min(Math.max(0, steps - 1), Math.floor(rotate)))
  if (pulses === 0) return Array(steps).fill(false)
  if (pulses === steps) return Array(steps).fill(true)
  const counts: number[] = []
  const remainders: number[] = []
  let divisor = steps - pulses
  remainders.push(pulses)
  let level = 0
  while (true) {
    counts.push(Math.floor(divisor / remainders[level]))
    remainders.push(divisor % remainders[level])
    divisor = remainders[level]
    level++
    if (remainders[level] <= 1) break
  }
  counts.push(divisor)
  const pattern: any[] = []
  const build = (lvl: number) => {
    if (lvl === -1) pattern.push(false)
    else if (lvl === -2) pattern.push(true)
    else {
      for (let i = 0; i < counts[lvl]; i++) build(lvl - 1)
      if (remainders[lvl] !== 0) build(lvl - 2)
    }
  }
  build(level)
  const flat: boolean[] = []
  const flatten = (arr: any[]) => {
    for (const x of arr) Array.isArray(x) ? flatten(x) : flat.push(!!x)
  }
  flatten(pattern)
  let out = flat.slice(0, steps)
  while (out.length < steps) out.push(false)
  if (rotate > 0 && steps > 1) {
    const rr = rotate % steps
    out = out.slice(steps - rr).concat(out.slice(0, steps - rr))
  }
  return out
}

export function EuclidModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    steps: steps[0],
    pulsesNorm: pulsesNorm[0],
    rotateNorm: rotateNorm[0],
    gateRatio: gateRatio[0],
    density: density[0],
    accent: accent[0],
  }))

  // Knob states (0..1 for knobs except steps uses discrete mapping)
  const [steps, setSteps] = useState([initialParameters?.steps ?? 8 / 16]) // maps to 8 initially
  const [pulsesNorm, setPulsesNorm] = useState([
    initialParameters?.pulsesNorm ?? 3 / 8,
  ]) // normalized by steps later
  const [rotateNorm, setRotateNorm] = useState([
    initialParameters?.rotateNorm ?? 0,
  ])
  const [gateRatio, setGateRatio] = useState([
    initialParameters?.gateRatio ?? 0.25,
  ])
  const [density, setDensity] = useState([initialParameters?.density ?? 1.0])
  const [accent, setAccent] = useState([initialParameters?.accent ?? 0.5])
  // 'Div' knob is uncontrolled; no explicit state needed
  const [currentStep, setCurrentStep] = useState(-1)

  // Audio nodes
  const audioContextRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const gateOutRef = useRef<GainNode | null>(null)
  const accentOutRef = useRef<GainNode | null>(null)
  const clockInRef = useRef<GainNode | null>(null)
  const resetInRef = useRef<GainNode | null>(null)
  const pulsesInRef = useRef<GainNode | null>(null)
  const rotateInRef = useRef<GainNode | null>(null)
  const densityInRef = useRef<GainNode | null>(null)
  const accentInRef = useRef<GainNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)
  const lastDivIdxRef = useRef(-1)

  const stepsInt = useMemo(
    () => Math.max(1, Math.min(16, Math.round((steps[0] ?? 0) * 15 + 1))),
    [steps],
  )
  const pulsesInt = useMemo(
    () =>
      Math.max(
        0,
        Math.min(stepsInt, Math.round((pulsesNorm[0] ?? 0) * stepsInt)),
      ),
    [pulsesNorm, stepsInt],
  )
  const rotateInt = useMemo(
    () =>
      Math.max(
        0,
        Math.min(
          Math.max(0, stepsInt - 1),
          Math.round((rotateNorm[0] ?? 0) * Math.max(0, stepsInt - 1)),
        ),
      ),
    [rotateNorm, stepsInt],
  )
  const pattern = useMemo(
    () => euclidPattern(stepsInt, pulsesInt, rotateInt),
    [stepsInt, pulsesInt, rotateInt],
  )

  useModuleInit(async () => {
    if (nodeRef.current) return
    const ac = getAudioContext()
    audioContextRef.current = ac

    // Inputs
    clockInRef.current = ac.createGain()
    clockInRef.current.gain.value = 1
    resetInRef.current = ac.createGain()
    resetInRef.current.gain.value = 1
    pulsesInRef.current = ac.createGain()
    pulsesInRef.current.gain.value = 1
    rotateInRef.current = ac.createGain()
    rotateInRef.current.gain.value = 1
    densityInRef.current = ac.createGain()
    densityInRef.current.gain.value = 1
    accentInRef.current = ac.createGain()
    accentInRef.current.gain.value = 1

    await ac.audioWorklet.addModule('/euclid-processor.js')

    const node = new AudioWorkletNode(ac, 'euclid-processor', {
      numberOfInputs: 6,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      parameterData: {
        run: 1,
        divider: 1,
        gateRatio: gateRatio[0] ?? 0.25,
        steps: stepsInt,
        pulsesNorm: pulsesNorm[0] ?? 0.375,
        rotateNorm: rotateNorm[0] ?? 0,
        density: density[0] ?? 1.0,
        accent: accent[0] ?? 0.5,
      },
    })
    nodeRef.current = node

    clockInRef.current.connect(node, 0, 0)
    resetInRef.current.connect(node, 0, 1)
    pulsesInRef.current.connect(node, 0, 2)
    rotateInRef.current.connect(node, 0, 3)
    densityInRef.current.connect(node, 0, 4)
    accentInRef.current.connect(node, 0, 5)

    const gateOut = ac.createGain()
    gateOut.gain.value = 1
    node.connect(gateOut, 0, 0)
    gateOutRef.current = gateOut
    const accOut = ac.createGain()
    accOut.gain.value = 1
    node.connect(accOut, 1, 0)
    accentOutRef.current = accOut

    // keep alive
    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    // keep both outputs alive so the worklet keeps processing even with no external connections
    gateOut.connect(keepAliveRef.current)
    accOut.connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)

    node.port.onmessage = (e) => {
      const { type, value } = e.data || {}
      if (type === 'step')
        setCurrentStep((prev) => (value !== prev ? value : prev))
    }
  }, moduleId)

  // Handlers for knobs
  const handleStepsChange = useCallback((v: number[]) => {
    const raw = v[0] ?? 0
    setSteps([raw])
    const ac = audioContextRef.current,
      node = nodeRef.current
    const s = Math.max(1, Math.min(16, Math.round(raw * 15 + 1)))
    if (ac && node)
      node.parameters.get('steps')?.setValueAtTime(s, ac.currentTime)
  }, [])

  const handlePulsesChange = useCallback((v: number[]) => {
    const raw = v[0] ?? 0
    setPulsesNorm([raw])
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node)
      node.parameters.get('pulsesNorm')?.setValueAtTime(raw, ac.currentTime)
  }, [])

  const handleRotateChange = useCallback((v: number[]) => {
    const raw = v[0] ?? 0
    setRotateNorm([raw])
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node)
      node.parameters.get('rotateNorm')?.setValueAtTime(raw, ac.currentTime)
  }, [])

  const handleGateRatioChange = useCallback((v: number[]) => {
    const raw = v[0] ?? 0
    setGateRatio([raw])
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node)
      node.parameters.get('gateRatio')?.setValueAtTime(raw, ac.currentTime)
  }, [])

  const handleDensityChange = useCallback((v: number[]) => {
    const raw = v[0] ?? 0
    setDensity([raw])
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node)
      node.parameters.get('density')?.setValueAtTime(raw, ac.currentTime)
  }, [])

  const handleAccentChange = useCallback((v: number[]) => {
    const raw = v[0] ?? 0
    setAccent([raw])
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node)
      node.parameters.get('accent')?.setValueAtTime(raw, ac.currentTime)
  }, [])

  const handleClockDividerChange = useCallback((v: number[]) => {
    const divValues = [1, 2, 4, 8, 16, 32, 64]
    const idx = Math.max(
      0,
      Math.min(
        divValues.length - 1,
        Math.round((v[0] || 0) * (divValues.length - 1)),
      ),
    )
    if (idx === lastDivIdxRef.current) return
    lastDivIdxRef.current = idx
    const next = divValues[idx]
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node)
      node.parameters.get('divider')?.setValueAtTime(next, ac.currentTime)
  }, [])

  const handleReset = useCallback(() => {
    const node = nodeRef.current
    if (node) node.port.postMessage({ type: 'reset' })
  }, [])

  // Dynamic tick labels for pulses/rotate/steps
  const stepTickLabels = useMemo(
    () => Array.from({ length: 16 }, (_, i) => `${i + 1}`),
    [],
  )
  const pulsesTickLabels = useMemo(
    () => Array.from({ length: stepsInt + 1 }, (_, i) => `${i}`),
    [stepsInt],
  )
  const rotateTickLabels = useMemo(
    () => Array.from({ length: Math.max(1, stepsInt) }, (_, i) => `${i}`),
    [stepsInt],
  )

  return (
    <ModuleContainer title="Euclid" moduleId={moduleId}>
      {/* Top row: CLK/RESET and outputs */}
      <div className="flex flex-col items-center justify-between gap-3">
        <div className="flex items-center justify-between">
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
            label="RST"
            audioType="cv"
            audioNode={resetInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-pulses-cv-in`}
            type="input"
            label="PUL"
            audioType="cv"
            audioNode={pulsesInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-rotate-cv-in`}
            type="input"
            label="ROT"
            audioType="cv"
            audioNode={rotateInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-density-cv-in`}
            type="input"
            label="DENS"
            audioType="cv"
            audioNode={densityInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-accent-cv-in`}
            type="input"
            label="ACC"
            audioType="cv"
            audioNode={accentInRef.current ?? undefined}
          />
          <PortGroup>
            <Port
              id={`${moduleId}-gate-out`}
              type="output"
              label="GATE"
              audioType="cv"
              audioNode={gateOutRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-accent-out`}
              type="output"
              label="ACC"
              audioType="cv"
              audioNode={accentOutRef.current ?? undefined}
            />
          </PortGroup>
        </div>

        <div className="flex-1 flex items-center justify-center gap-4.5">
          {/* <PushButton onClick={handleReset} label="reset" size="sm" /> */}
          <Knob
            defaultValue={[0]}
            onValueChange={handleClockDividerChange}
            size="sm"
            label="Div"
            steps={7}
            tickLabels={['1', '2', '4', '8', '16', '32', '64']}
          />
          <Knob
            value={steps}
            onValueChange={handleStepsChange}
            size="sm"
            label="Steps"
            steps={16}
            tickLabels={stepTickLabels}
          />
          <Knob
            value={pulsesNorm}
            onValueChange={handlePulsesChange}
            size="sm"
            label="Count"
            steps={stepsInt + 1}
            tickLabels={pulsesTickLabels}
          />
          <Knob
            value={rotateNorm}
            onValueChange={handleRotateChange}
            size="sm"
            label="Rotate"
            steps={Math.max(1, stepsInt)}
            tickLabels={rotateTickLabels}
          />
          <Knob
            value={density}
            onValueChange={handleDensityChange}
            size="sm"
            label="Dens"
          />
          <Knob
            value={accent}
            onValueChange={handleAccentChange}
            size="sm"
            label="Acc"
          />
          <Knob
            value={gateRatio}
            onValueChange={handleGateRatioChange}
            size="sm"
            label="Gate"
          />
        </div>
      </div>

      <div className="flex-grow" />

      {/* Pattern preview */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1.5">
          {Array.from({ length: stepsInt }).map((_, i) => {
            const isPulse = pattern[i]
            const isCur = i === currentStep
            const cls = isCur
              ? isPulse
                ? 'bg-green-500 shadow-[0_0_6px_var(--color-green-400)]'
                : 'bg-yellow-500 shadow-[0_0_8px_var(--color-yellow-300)]'
              : isPulse
                ? 'bg-blue-600 shadow-[0_0_4px_var(--color-blue-500)]'
                : 'bg-neutral-400'
            return <div key={i} className={`w-3 h-3 rounded-full ${cls}`} />
          })}
        </div>
      </div>
    </ModuleContainer>
  )
}
