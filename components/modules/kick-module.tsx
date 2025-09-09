'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { VLine } from '@/components/marks'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { mapLinear } from '@/lib/utils'

// Frequency mapping (normalized 0..1 -> 30..160 Hz, logarithmic)
const FREQ_MIN = 30
const FREQ_MAX = 160
const FREQ_RATIO = FREQ_MAX / FREQ_MIN
const mapTuneNormToHz = (n: number) =>
  FREQ_MIN * FREQ_RATIO ** Math.max(0, Math.min(1, n))
const mapHzToTuneNorm = (hz: number) => {
  const f = Math.max(FREQ_MIN, Math.min(FREQ_MAX, hz))
  return Math.log(f / FREQ_MIN) / Math.log(FREQ_RATIO)
}

// Sweep semitones 0..24
const SWEEP_MIN = 0
const SWEEP_MAX = 24
const mapSweepNormToSemis = (n: number) => mapLinear(n, SWEEP_MIN, SWEEP_MAX)
const mapSemisToSweepNorm = (s: number) =>
  (s - SWEEP_MIN) / (SWEEP_MAX - SWEEP_MIN)

// Decay seconds 0.04..2.5
const DECAY_MIN = 0.04
const DECAY_MAX = 2.5
const mapDecayNormToSeconds = (n: number) => mapLinear(n, DECAY_MIN, DECAY_MAX)
const mapSecondsToDecayNorm = (s: number) =>
  (s - DECAY_MIN) / (DECAY_MAX - DECAY_MIN)

// Attack amount 0..1 (linear)
const mapAttackNormToAmount = (n: number) => Math.max(0, Math.min(1, n))

// Defaults
const DEFAULT_FREQ_HZ = 60
const DEFAULT_SWEEP_SEMIS = 10
const DEFAULT_DECAY_S = 0.6
const DEFAULT_ATTACK_AMT = 0.25

export function KickModule({ moduleId }: { moduleId: string }) {
  // State persisted in patch
  const { initialParameters } = useModulePatch(moduleId, () => ({
    tuneN: tuneN[0],
    sweepN: sweepN[0],
    decayN: decayN[0],
    attackN: attackN[0],
    sweepCvAmt: sweepCvAmt[0],
    attackCvAmt: attackCvAmt[0],
    decayCvAmt: decayCvAmt[0],
    is909,
  }))

  const [tuneN, setTuneN] = useState<number[]>([
    initialParameters?.tuneN ?? mapHzToTuneNorm(DEFAULT_FREQ_HZ),
  ])
  const [sweepN, setSweepN] = useState<number[]>([
    initialParameters?.sweepN ?? mapSemisToSweepNorm(DEFAULT_SWEEP_SEMIS),
  ])
  const [decayN, setDecayN] = useState<number[]>([
    initialParameters?.decayN ?? mapSecondsToDecayNorm(DEFAULT_DECAY_S),
  ])
  const [attackN, setAttackN] = useState<number[]>([
    initialParameters?.attackN ?? DEFAULT_ATTACK_AMT,
  ])

  const [sweepCvAmt, setSweepCvAmt] = useState<number[]>([
    initialParameters?.sweepCvAmt ?? 0,
  ])
  const [attackCvAmt, setAttackCvAmt] = useState<number[]>([
    initialParameters?.attackCvAmt ?? 0,
  ])
  const [decayCvAmt, setDecayCvAmt] = useState<number[]>([
    initialParameters?.decayCvAmt ?? 0,
  ])
  const [is909, setIs909] = useState<boolean>(initialParameters?.is909 ?? false)

  // Audio graph
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)

  // Inputs
  const trigInRef = useRef<GainNode | null>(null)
  const tuneInRef = useRef<GainNode | null>(null)
  const sweepInRef = useRef<GainNode | null>(null)
  const attackInRef = useRef<GainNode | null>(null)
  const decayInRef = useRef<GainNode | null>(null)

  // Output
  const outRef = useRef<GainNode | null>(null)

  // Initialize worklet and nodes
  useModuleInit(async () => {
    if (workletRef.current) return

    const ac = getAudioContext()
    audioContextRef.current = ac

    await ac.audioWorklet.addModule('/kick-processor.js')

    trigInRef.current = ac.createGain()
    trigInRef.current.gain.value = 1
    tuneInRef.current = ac.createGain()
    tuneInRef.current.gain.value = 1
    sweepInRef.current = ac.createGain()
    sweepInRef.current.gain.value = 1
    attackInRef.current = ac.createGain()
    attackInRef.current.gain.value = 1
    decayInRef.current = ac.createGain()
    decayInRef.current.gain.value = 1

    outRef.current = ac.createGain()
    outRef.current.gain.value = 1

    const node = new AudioWorkletNode(ac, 'kick-processor', {
      numberOfInputs: 5,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })

    // Initial params
    const now = ac.currentTime
    node.parameters
      .get('baseFreq')
      ?.setValueAtTime(mapTuneNormToHz(tuneN[0]), now)
    node.parameters
      .get('sweepSemis')
      ?.setValueAtTime(mapSweepNormToSemis(sweepN[0]), now)
    node.parameters
      .get('decaySeconds')
      ?.setValueAtTime(mapDecayNormToSeconds(decayN[0]), now)
    node.parameters
      .get('attackAmount')
      ?.setValueAtTime(mapAttackNormToAmount(attackN[0]), now)
    node.parameters.get('sweepCvAmt')?.setValueAtTime(sweepCvAmt[0], now)
    node.parameters.get('attackCvAmt')?.setValueAtTime(attackCvAmt[0], now)
    node.parameters.get('decayCvAmt')?.setValueAtTime(decayCvAmt[0], now)
    node.parameters.get('model')?.setValueAtTime(is909 ? 1 : 0, now)

    // Connections
    trigInRef.current.connect(node, 0, 0)
    tuneInRef.current.connect(node, 0, 1)
    sweepInRef.current.connect(node, 0, 2)
    attackInRef.current.connect(node, 0, 3)
    decayInRef.current.connect(node, 0, 4)

    node.connect(outRef.current)

    workletRef.current = node
  }, moduleId)

  // Push UI changes to worklet params
  const pushParams = useCallback(() => {
    const ac = audioContextRef.current
    const node = workletRef.current
    if (!ac || !node) return
    const now = ac.currentTime
    node.parameters
      .get('baseFreq')
      ?.setValueAtTime(mapTuneNormToHz(tuneN[0]), now)
    node.parameters
      .get('sweepSemis')
      ?.setValueAtTime(mapSweepNormToSemis(sweepN[0]), now)
    node.parameters
      .get('decaySeconds')
      ?.setValueAtTime(mapDecayNormToSeconds(decayN[0]), now)
    node.parameters
      .get('attackAmount')
      ?.setValueAtTime(mapAttackNormToAmount(attackN[0]), now)
    node.parameters.get('sweepCvAmt')?.setValueAtTime(sweepCvAmt[0], now)
    node.parameters.get('attackCvAmt')?.setValueAtTime(attackCvAmt[0], now)
    node.parameters.get('decayCvAmt')?.setValueAtTime(decayCvAmt[0], now)
    node.parameters.get('model')?.setValueAtTime(is909 ? 1 : 0, now)
  }, [
    tuneN,
    sweepN,
    decayN,
    attackN,
    sweepCvAmt,
    attackCvAmt,
    decayCvAmt,
    is909,
  ])

  useEffect(() => {
    pushParams()
  }, [pushParams])

  return (
    <ModuleContainer moduleId={moduleId} title="Kick">
      <div className="flex flex-col gap-6 items-center mt-4">
        <div className="flex gap-8 items-center">
          <Knob value={tuneN} onValueChange={setTuneN} size="md" label="Tune" />
          <Knob
            value={sweepN}
            onValueChange={setSweepN}
            size="md"
            label="Sweep"
          />
          <Knob
            value={attackN}
            onValueChange={setAttackN}
            size="md"
            label="Attack"
          />
          <Knob
            value={decayN}
            onValueChange={setDecayN}
            size="md"
            label="Decay"
          />
          <ToggleSwitch
            label={is909 ? '909' : '808'}
            value={is909}
            onValueChange={setIs909}
          />
        </div>

        <div className="flex flex-col gap-1 w-full">
          <div className="flex justify-between">
            <div className="flex flex-col items-center gap-3">
              <Knob
                value={sweepCvAmt}
                onValueChange={setSweepCvAmt}
                size="xs"
              />
              <VLine />
              <Port
                id={`${moduleId}-sweep-in`}
                type="input"
                audioType="cv"
                label="Sweep"
                audioNode={sweepInRef.current ?? undefined}
              />
            </div>
            <div className="flex flex-col items-center gap-3">
              <Knob
                value={attackCvAmt}
                onValueChange={setAttackCvAmt}
                size="xs"
              />
              <VLine />
              <Port
                id={`${moduleId}-attack-in`}
                type="input"
                audioType="cv"
                label="Attack"
                audioNode={attackInRef.current ?? undefined}
              />
            </div>
            <div className="flex flex-col items-center gap-3">
              <Knob
                value={decayCvAmt}
                onValueChange={setDecayCvAmt}
                size="xs"
              />
              <VLine />
              <Port
                id={`${moduleId}-decay-in`}
                type="input"
                audioType="cv"
                label="Decay"
                audioNode={decayInRef.current ?? undefined}
              />
            </div>
          </div>

          <div className="flex justify-between">
            <Port
              id={`${moduleId}-trig-in`}
              type="input"
              audioType="trig"
              label="Trig"
              audioNode={trigInRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-tune-in`}
              type="input"
              audioType="cv"
              label="Tune"
              audioNode={tuneInRef.current ?? undefined}
            />
            <PortGroup>
              <Port
                id={`${moduleId}-audio-out`}
                type="output"
                audioType="audio"
                label="Out"
                audioNode={outRef.current ?? undefined}
              />
            </PortGroup>
          </div>
        </div>
      </div>
    </ModuleContainer>
  )
}
