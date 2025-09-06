'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Button } from '@/components/ui/button'
import { Knob } from '@/components/ui/knob'
import { KnobV2 } from '@/components/ui/knob-v2'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { mapLinear } from '@/lib/utils'
import { VLine } from '../marks'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

// ---------- ranges ----------
const FREQ_MIN = 0.5,
  FREQ_MAX = 100
const PW_MIN = 0.01,
  PW_MAX = 0.99
const AMP_MIN = 0,
  AMP_MAX = 2
const OFF_MIN = -1,
  OFF_MAX = 1
const SLEW_MIN = 0,
  SLEW_MAX = 1
const RATEAMT_MIN = 0,
  RATEAMT_MAX = 4
const PWAMT_MIN = 0,
  PWAMT_MAX = 1
const AMPAMT_MIN = 0,
  AMPAMT_MAX = 2 // NEW: Amp CV depth
const OFFAMT_MIN = 0,
  OFFAMT_MAX = 2 // NEW: Offset CV depth

const invMapLinear = (value: number, min: number, max: number) => {
  if (max === min) return 0
  const t = (value - min) / (max - min)
  return Math.max(0, Math.min(1, t))
}

type Shape = 0 | 1 | 2 | 3 | 4 | 5

const icons: Record<Shape, React.ReactNode> = {
  0: (
    <svg width="16" height="12" viewBox="0 0 32 24">
      <path
        d="M2 12 Q8 4 16 12 T30 12"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  ),
  1: (
    <svg width="16" height="12" viewBox="0 0 32 24">
      <path
        d="M2 20 L8 4 L14 20 L20 4 L26 20 L30 12"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  ),
  2: (
    <svg width="16" height="12" viewBox="0 0 32 24">
      <path
        d="M2 20 L10 4 L10 20 L18 4 L18 20 L26 4 L26 20 L30 20"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  ),
  3: (
    <svg width="16" height="12" viewBox="0 0 32 24">
      <path
        d="M2 20 L2 4 L12 4 L12 20 L22 20 L22 4 L30 4 L30 20"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  ),
  4: (
    <svg width="16" height="12" viewBox="0 0 32 24">
      <path
        d="M2 16 Q6 8 10 14 T18 10 Q22 18 26 12 L30 16"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  ),
  5: (
    <svg width="16" height="12" viewBox="0 0 32 24">
      <path
        d="M2 16 L6 16 L6 8 L10 8 L10 18 L14 18 L14 6 L18 6 L18 14 L22 14 L22 20 L26 20 L26 10 L30 10"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  ),
}

export function LFOModule({ moduleId }: { moduleId: string }) {
  // Defaults (physical)
  const DEFAULT_FREQ = 0.5
  const DEFAULT_PW = 0.5
  const DEFAULT_AMP = 0.5
  const DEFAULT_OFF = 0.5
  const DEFAULT_SLEW = 0
  const DEFAULT_RATEAMT = 1
  const DEFAULT_PWAMT = 1
  const DEFAULT_AMPAMT = 1 // NEW
  const DEFAULT_OFFAMT = 1 // NEW

  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    shape,
    freq: mapLinear(freq[0], FREQ_MIN, FREQ_MAX),
    pw: mapLinear(pw[0], PW_MIN, PW_MAX),
    amp: mapLinear(amp[0], AMP_MIN, AMP_MAX),
    offset: mapLinear(offset[0], OFF_MIN, OFF_MAX),
    slew: mapLinear(slew[0], SLEW_MIN, SLEW_MAX),
    rateAmt: mapLinear(rateAmt[0], RATEAMT_MIN, RATEAMT_MAX),
    pwAmt: mapLinear(pwAmt[0], PWAMT_MIN, PWAMT_MAX),
    ampAmt: mapLinear(ampAmt[0], AMPAMT_MIN, AMPAMT_MAX),
    offAmt: mapLinear(offAmt[0], OFFAMT_MIN, OFFAMT_MAX),
  }))

  // UI state (normalized 0..1)
  const [shape, setShape] = useState<Shape>(initialParameters?.shape ?? 0)
  const [freq, setFreq] = useState([
    invMapLinear(
      initialParameters?.freq ?? mapLinear(DEFAULT_FREQ, FREQ_MIN, FREQ_MAX),
      FREQ_MIN,
      FREQ_MAX,
    ),
  ])
  const [pw, setPw] = useState([
    invMapLinear(
      initialParameters?.pw ?? mapLinear(DEFAULT_PW, PW_MIN, PW_MAX),
      PW_MIN,
      PW_MAX,
    ),
  ])
  const [amp, setAmp] = useState([
    invMapLinear(
      initialParameters?.amp ?? mapLinear(DEFAULT_AMP, AMP_MIN, AMP_MAX),
      AMP_MIN,
      AMP_MAX,
    ),
  ])
  const [offset, setOffset] = useState([
    invMapLinear(
      initialParameters?.offset ?? mapLinear(DEFAULT_OFF, OFF_MIN, OFF_MAX),
      OFF_MIN,
      OFF_MAX,
    ),
  ])
  const [slew, setSlew] = useState([
    invMapLinear(
      initialParameters?.slew ?? mapLinear(DEFAULT_SLEW, SLEW_MIN, SLEW_MAX),
      SLEW_MIN,
      SLEW_MAX,
    ),
  ])
  const [rateAmt, setRateAmt] = useState([
    invMapLinear(
      initialParameters?.rateAmt ??
        mapLinear(DEFAULT_RATEAMT, RATEAMT_MIN, RATEAMT_MAX),
      RATEAMT_MIN,
      RATEAMT_MAX,
    ),
  ])
  const [pwAmt, setPwAmt] = useState([
    invMapLinear(
      initialParameters?.pwAmt ??
        mapLinear(DEFAULT_PWAMT, PWAMT_MIN, PWAMT_MAX),
      PWAMT_MIN,
      PWAMT_MAX,
    ),
  ])
  const [ampAmt, setAmpAmt] = useState([
    invMapLinear(
      initialParameters?.ampAmt ??
        mapLinear(DEFAULT_AMPAMT, AMPAMT_MIN, AMPAMT_MAX),
      AMPAMT_MIN,
      AMPAMT_MAX,
    ),
  ])
  const [offAmt, setOffAmt] = useState([
    invMapLinear(
      initialParameters?.offAmt ??
        mapLinear(DEFAULT_OFFAMT, OFFAMT_MIN, OFFAMT_MAX),
      OFFAMT_MIN,
      OFFAMT_MAX,
    ),
  ])

  // graph
  const acRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)

  // inputs (ports)
  const rateInRef = useRef<GainNode | null>(null)
  const pwInRef = useRef<GainNode | null>(null)
  const ampInRef = useRef<GainNode | null>(null)
  const offInRef = useRef<GainNode | null>(null)
  const syncInRef = useRef<GainNode | null>(null)

  // outputs (ports)
  const outBipRef = useRef<GainNode | null>(null)
  const outUniRef = useRef<GainNode | null>(null)

  const setParam = (name: string, v: number, t?: number) => {
    const ac = acRef.current,
      w = workletRef.current
    if (!ac || !w) return
    const p = w.parameters.get(name)
    if (p) p.setTargetAtTime(v, ac.currentTime, t ?? 0.01)
  }

  const init = useCallback(async () => {
    if (workletRef.current) return // Already initialized

    const ac = getAudioContext()
    acRef.current = ac
    await ac.audioWorklet.addModule('/lfo-processor.js')

    // inputs (CV ports)
    const mkIn = () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    }
    rateInRef.current = mkIn()
    pwInRef.current = mkIn()
    ampInRef.current = mkIn()
    offInRef.current = mkIn()
    syncInRef.current = mkIn()

    // Map normalized → physical for initial parameterData
    const w = new AudioWorkletNode(ac, 'lfo-processor', {
      numberOfInputs: 5,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      parameterData: {
        freq: mapLinear(freq[0], FREQ_MIN, FREQ_MAX),
        shape,
        pw: mapLinear(pw[0], PW_MIN, PW_MAX),
        amp: mapLinear(amp[0], AMP_MIN, AMP_MAX),
        offset: mapLinear(offset[0], OFF_MIN, OFF_MAX),
        rateCvAmt: mapLinear(rateAmt[0], RATEAMT_MIN, RATEAMT_MAX),
        pwCvAmt: mapLinear(pwAmt[0], PWAMT_MIN, PWAMT_MAX),
        ampCvAmt: mapLinear(ampAmt[0], AMPAMT_MIN, AMPAMT_MAX), // NEW
        offCvAmt: mapLinear(offAmt[0], OFFAMT_MIN, OFFAMT_MAX), // NEW
        slew: mapLinear(slew[0], SLEW_MIN, SLEW_MAX),
      },
    } as any)
    workletRef.current = w

    // wire CV inputs
    rateInRef.current.connect(w, 0, 0)
    pwInRef.current.connect(w, 0, 1)
    ampInRef.current.connect(w, 0, 2)
    offInRef.current.connect(w, 0, 3)
    syncInRef.current.connect(w, 0, 4)

    // Create output port nodes and connect each worklet output directly
    outBipRef.current = ac.createGain()
    outBipRef.current.gain.value = 1
    outUniRef.current = ac.createGain()
    outUniRef.current.gain.value = 1

    // IMPORTANT: select output index explicitly
    w.connect(outBipRef.current, 0, 0) // worklet output 0 → OUT (bipolar)
    w.connect(outUniRef.current, 1, 0) // worklet output 1 → UNI (unipolar)

    console.log('[LFO] initialized')
  }, [freq, shape, pw, amp, offset, rateAmt, pwAmt, ampAmt, offAmt, slew])

  // Use the module initialization hook
  const { isReady, initError, retryInit } = useModuleInit(init, 'LFO')

  // param pushes
  useEffect(() => {
    setParam('freq', mapLinear(freq[0], FREQ_MIN, FREQ_MAX))
  }, [freq])
  useEffect(() => {
    setParam('shape', shape)
  }, [shape])
  useEffect(() => {
    setParam('pw', mapLinear(pw[0], PW_MIN, PW_MAX))
  }, [pw])
  useEffect(() => {
    setParam('amp', mapLinear(amp[0], AMP_MIN, AMP_MAX))
  }, [amp])
  useEffect(() => {
    setParam('offset', mapLinear(offset[0], OFF_MIN, OFF_MAX))
  }, [offset])
  useEffect(() => {
    setParam('rateCvAmt', mapLinear(rateAmt[0], RATEAMT_MIN, RATEAMT_MAX))
  }, [rateAmt])
  useEffect(() => {
    setParam('pwCvAmt', mapLinear(pwAmt[0], PWAMT_MIN, PWAMT_MAX))
  }, [pwAmt])
  useEffect(() => {
    setParam('ampCvAmt', mapLinear(ampAmt[0], AMPAMT_MIN, AMPAMT_MAX))
  }, [ampAmt]) // NEW
  useEffect(() => {
    setParam('offCvAmt', mapLinear(offAmt[0], OFFAMT_MIN, OFFAMT_MAX))
  }, [offAmt]) // NEW
  useEffect(() => {
    setParam('slew', mapLinear(slew[0], SLEW_MIN, SLEW_MAX))
  }, [slew])

  return (
    <ModuleContainer title="LFO" moduleId={moduleId}>
      {/* Wave buttons */}
      <ToggleGroup
        type="single"
        size="md"
        value={shape.toString()}
        onValueChange={(v) => setShape(parseInt(v, 10) as Shape)}
      >
        {[0, 1, 2, 3, 5].map((s) => (
          <ToggleGroupItem key={s} value={s.toString()}>
            {icons[s as Shape]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex flex-col items-center gap-6 mt-5">
        <Knob value={freq} onValueChange={setFreq} label="Freq" size="lg" />

        <div className="flex flex-col items-center gap-6">
          <Knob value={amp} onValueChange={setAmp} label="Amp" size="md" />

          <div className="flex gap-6">
            <Knob
              value={offset}
              onValueChange={setOffset}
              label="Oset"
              size="sm"
            />
            <Knob value={pw} onValueChange={setPw} label="PWM" size="sm" />
            <Knob value={slew} onValueChange={setSlew} label="Slew" size="sm" />
          </div>
        </div>
      </div>

      <div className="flex-1" />

      {/* Ports – pass the node you want that port to represent */}
      <div className="flex flex-col gap-1 flex-1 justify-end">
        <div className="flex justify-between items-end gap-0">
          <div className="flex flex-col items-center gap-3">
            <Knob value={rateAmt} onValueChange={setRateAmt} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-rate-cv-in`}
              type="input"
              label="RATE"
              audioType="cv"
              audioNode={rateInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={pwAmt} onValueChange={setPwAmt} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-pw-cv-in`}
              type="input"
              label="PWM"
              audioType="cv"
              audioNode={pwInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={ampAmt} onValueChange={setAmpAmt} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-amp-cv-in`}
              type="input"
              label="AMP"
              audioType="cv"
              audioNode={ampInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={offAmt} onValueChange={setOffAmt} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-offset-cv-in`}
              type="input"
              label="OFFS"
              audioType="cv"
              audioNode={offInRef.current ?? undefined}
            />
          </div>
        </div>
        <div className="flex justify-between">
          <Port
            id={`${moduleId}-sync-in`}
            type="input"
            label="SYNC"
            audioType="cv"
            audioNode={syncInRef.current ?? undefined}
          />
          <PortGroup>
            <Port
              id={`${moduleId}-uni-out`}
              type="output"
              label="UNI"
              audioType="cv"
              audioNode={outUniRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-cv-out`}
              type="output"
              label="OUT"
              audioType="cv"
              audioNode={outBipRef.current ?? undefined}
            />
          </PortGroup>
        </div>
      </div>
    </ModuleContainer>
  )
}
