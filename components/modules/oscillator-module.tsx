'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Button } from '@/components/ui/button'
import { Knob } from '@/components/ui/knob'
import { KnobV3 } from '@/components/ui/knob-v3'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { mapLinear } from '@/lib/utils'

type WaveType = 'sine' | 'square' | 'sawtooth' | 'triangle'

const WaveformIcon = ({ type }: { type: WaveType }) => {
  const iconProps = {
    width: 16,
    height: 12,
    viewBox: '0 0 32 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
  }
  switch (type) {
    case 'sine':
      return (
        <svg {...iconProps}>
          <path d="M2 12 Q8 4 16 12 T30 12" />
        </svg>
      )
    case 'square':
      return (
        <svg {...iconProps}>
          <path d="M2 20 L2 4 L10 4 L10 20 L18 20 L18 4 L26 4 L26 20 L30 20" />
        </svg>
      )
    case 'sawtooth':
      return (
        <svg {...iconProps}>
          <path d="M2 20 L10 4 L10 20 L18 4 L18 20 L26 4 L26 20 L30 20" />
        </svg>
      )
    case 'triangle':
      return (
        <svg {...iconProps}>
          <path d="M2 20 L8 4 L14 20 L20 4 L26 20 L30 12" />
        </svg>
      )
  }
}

export function OscillatorModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    tune: tune[0],
    octave: octave[0],
    phase: phase[0],
    waveType,
    pulseWidth: pulseWidth[0],
    syncAmount: syncAmount[0],
    waveformMorph: waveformMorph[0],
    fmAmount: fmAmount[0],
    pwmCvAmt: pwmCvAmt[0],
    morphCvAmt: morphCvAmt[0],
  }))

  const [tune, setTune] = useState<number[]>([initialParameters?.tune ?? 0])
  const [octave, setOctave] = useState<number[]>([
    initialParameters?.octave ?? 0,
  ])
  const [phase, setPhase] = useState<number[]>([initialParameters?.phase ?? 0])
  const [waveType, setWaveType] = useState<WaveType>(
    initialParameters?.waveType ?? 'square',
  )
  const [pulseWidth, setPulseWidth] = useState<number[]>([
    initialParameters?.pulseWidth ?? 0.5,
  ])
  const [syncAmount, setSyncAmount] = useState<number[]>([
    initialParameters?.syncAmount ?? 0,
  ])
  const [waveformMorph, setWaveformMorph] = useState<number[]>([
    initialParameters?.waveformMorph ?? 0,
  ])
  const [fmAmount, setFmAmount] = useState<number[]>([
    initialParameters?.fmAmount ?? 0,
  ])
  const [pwmCvAmt, setPwmCvAmt] = useState<number[]>([
    initialParameters?.pwmCvAmt ?? 1,
  ])
  const [morphCvAmt, setMorphCvAmt] = useState<number[]>([
    initialParameters?.morphCvAmt ?? 1,
  ])

  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)

  // Inputs (CV/audio)
  const frequencyInputRef = useRef<GainNode | null>(null) // Pitch CV (1V/Oct)
  const syncInputRef = useRef<GainNode | null>(null) // Sync (audio)
  const pwmInputRef = useRef<GainNode | null>(null) // PWM CV
  const fmInputRef = useRef<GainNode | null>(null) // FM CV (exp FM)
  const morphInputRef = useRef<GainNode | null>(null) // NEW: Morph CV

  // Output
  const outputRef = useRef<GainNode | null>(null)

  const getWaveformIndex = useCallback(
    (wave: WaveType): number =>
      ({ sine: 0, square: 1, sawtooth: 2, triangle: 3 })[wave],
    [],
  )

  const initAudioNodes = useCallback(async () => {
    if (workletNodeRef.current) return // Already initialized

    const ac = getAudioContext()
    audioContextRef.current = ac

    if (ac.state === 'suspended') await ac.resume()
    await ac.audioWorklet.addModule('/oscillator-processor.js')

    frequencyInputRef.current = ac.createGain()
    frequencyInputRef.current.gain.value = 1
    syncInputRef.current = ac.createGain()
    syncInputRef.current.gain.value = 1
    pwmInputRef.current = ac.createGain()
    pwmInputRef.current.gain.value = 1
    fmInputRef.current = ac.createGain()
    fmInputRef.current.gain.value = 1
    morphInputRef.current = ac.createGain()
    morphInputRef.current.gain.value = 1

    outputRef.current = ac.createGain()
    outputRef.current.gain.value = 1

    const w = new AudioWorkletNode(ac, 'oscillator-processor', {
      numberOfInputs: 5,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    })

    const t = ac.currentTime
    w.parameters.get('frequency')?.setValueAtTime(440, t)
    w.parameters.get('waveform')?.setValueAtTime(getWaveformIndex(waveType), t)
    w.parameters.get('phase')?.setValueAtTime(phase[0], t)
    w.parameters.get('tune')?.setValueAtTime(tune[0], t)
    w.parameters.get('octave')?.setValueAtTime(octave[0], t)
    w.parameters.get('pulseWidth')?.setValueAtTime(pulseWidth[0], t)
    w.parameters.get('gain')?.setValueAtTime(5, t)
    w.parameters.get('syncAmount')?.setValueAtTime(syncAmount[0], t)
    w.parameters.get('waveformMorph')?.setValueAtTime(waveformMorph[0], t)
    w.parameters.get('fmAmount')?.setValueAtTime(fmAmount[0], t)
    w.parameters.get('pwmCvAmt')?.setValueAtTime(pwmCvAmt[0], t)
    w.parameters.get('morphCvAmt')?.setValueAtTime(morphCvAmt[0], t) // NEW

    // Inputs → worklet (0..4)
    frequencyInputRef.current.connect(w, 0, 0) // Note CV (1V/Oct)
    syncInputRef.current.connect(w, 0, 1) // Sync
    pwmInputRef.current.connect(w, 0, 2) // PWM CV
    fmInputRef.current.connect(w, 0, 3) // FM CV
    morphInputRef.current.connect(w, 0, 4) // Morph CV (NEW)

    w.connect(outputRef.current)

    workletNodeRef.current = w
  }, [
    waveType,
    phase,
    tune,
    octave,
    pulseWidth,
    syncAmount,
    waveformMorph,
    fmAmount,
    pwmCvAmt,
    morphCvAmt,
  ])

  // Use the module initialization hook
  const { isReady, initError, retryInit } = useModuleInit(initAudioNodes, 'VCO')

  const tuneToKnob = (tuneValue: number) => (tuneValue + 600) / 1200
  const knobToTune = (knobValue: number) => mapLinear(knobValue, -600, 600)
  const octaveToKnob = (octaveValue: number) => (octaveValue + 4) / 8
  const knobToOctave = (knobValue: number) =>
    Math.round(mapLinear(knobValue, -4, 4))
  const phaseToKnob = (phaseValue: number) => phaseValue / 6.28
  const knobToPhase = (knobValue: number) => mapLinear(knobValue, 0, 6.28)

  // Helper function to push all parameters to the audio worklet
  const pushParametersToWorklet = useCallback(() => {
    const ac = audioContextRef.current,
      w = workletNodeRef.current
    if (!ac || !w) return
    const now = ac.currentTime

    w.parameters.get('tune')?.setTargetAtTime(tune[0], now, 0.01)
    w.parameters.get('octave')?.setTargetAtTime(octave[0], now, 0.01)
    w.parameters.get('phase')?.setTargetAtTime(phase[0], now, 0.01)
    const wf = w.parameters.get('waveform')
    if (wf) {
      wf.cancelScheduledValues(now)
      wf.setValueAtTime(getWaveformIndex(waveType), now)
    }
    w.parameters.get('pulseWidth')?.setTargetAtTime(pulseWidth[0], now, 0.01)
    w.parameters.get('syncAmount')?.setTargetAtTime(syncAmount[0], now, 0.01)
    w.parameters
      .get('waveformMorph')
      ?.setTargetAtTime(waveformMorph[0], now, 0.01)
    w.parameters.get('fmAmount')?.setTargetAtTime(fmAmount[0], now, 0.01)
    w.parameters.get('pwmCvAmt')?.setTargetAtTime(pwmCvAmt[0], now, 0.01)
    w.parameters.get('morphCvAmt')?.setTargetAtTime(morphCvAmt[0], now, 0.01)
  }, [
    tune,
    octave,
    phase,
    waveType,
    pulseWidth,
    syncAmount,
    waveformMorph,
    fmAmount,
    pwmCvAmt,
    morphCvAmt,
    getWaveformIndex,
  ])

  // Push param changes when values change
  useEffect(() => {
    pushParametersToWorklet()
  }, [pushParametersToWorklet])

  return (
    <ModuleContainer moduleId={moduleId} title="VCO">
      <div className="grid grid-cols-4 mx-auto gap-0">
        {(['sine', 'square', 'sawtooth', 'triangle'] as WaveType[]).map(
          (wave) => (
            <Button
              key={wave}
              variant={waveType === wave ? 'default' : 'secondary'}
              size="sm"
              className="size-8 px-0"
              onClick={() => setWaveType(wave)}
            >
              <WaveformIcon type={wave} />
            </Button>
          ),
        )}
      </div>

      <div className="flex flex-col items-center gap-5 mt-5">
        <Knob
          value={[octaveToKnob(octave[0])]}
          onValueChange={(value) => setOctave([knobToOctave(value[0])])}
          size="lg"
          label="Octave"
          tickLabels={[0, 1, 2, 3, 4, 5, 6, 7, 8]}
        />

        <Knob
          value={[tuneToKnob(tune[0])]}
          onValueChange={(v) => setTune([knobToTune(v[0])])}
          size="md"
          label="Tune"
        />
        {/* <Knob
            value={[phaseToKnob(phase[0])]}
            onValueChange={(v) => setPhase([knobToPhase(v[0])])}
            size="sm"
            label="Phase"
          /> */}

        <div className="flex gap-6 justify-center">
          <Knob
            value={syncAmount}
            onValueChange={setSyncAmount}
            size="sm"
            label="Sync"
          />
          <Knob
            value={pulseWidth}
            onValueChange={setPulseWidth}
            size="sm"
            label="PWM"
          />
        </div>

        {/* xs attenuators */}
        <div className="flex gap-2 justify-center"></div>
      </div>

      <div className="flex-grow" />

      {/* Ports */}
      <div className="flex flex-col gap-1">
        <div className="flex items-end gap-0">
          <div className="flex flex-col items-center gap-2">
            <Knob value={fmAmount} onValueChange={setFmAmount} size="xs" />
            <Port
              id={`${moduleId}-fm-in`}
              type="input"
              audioType="cv"
              label="FM"
              audioNode={fmInputRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={morphCvAmt} onValueChange={setMorphCvAmt} size="xs" />
            <Port
              id={`${moduleId}-morph-in`}
              type="input"
              audioType="cv"
              label="Morph"
              audioNode={morphInputRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob value={pwmCvAmt} onValueChange={setPwmCvAmt} size="xs" />
            <Port
              id={`${moduleId}-pwm-in`}
              type="input"
              audioType="cv"
              label="PWM"
              audioNode={pwmInputRef.current ?? undefined}
            />
          </div>
        </div>
        <div className="flex gap-0">
          <Port
            id={`${moduleId}-freq-in`}
            type="input"
            audioType="cv"
            label="Note"
            audioNode={frequencyInputRef.current ?? undefined}
          />
          <PortGroup>
            <Port
              id={`${moduleId}-sync-in`}
              type="input"
              audioType="audio"
              label="Sync"
              audioNode={syncInputRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-audio-out`}
              type="output"
              audioType="audio"
              label="Out"
              audioNode={outputRef.current ?? undefined}
            />
          </PortGroup>
        </div>
      </div>
    </ModuleContainer>
  )
}
