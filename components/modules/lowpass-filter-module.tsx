'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import * as utils from '@/lib/utils'

// Optional: wire these if your host expects them
const getParameters = () => {}
const setParameters = (_: any) => {}

const MIN_CUTOFF = 20
const MAX_CUTOFF = 10000

export function LowPassFilterModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    cutoff: cutoff[0],
    resonance: resonance[0],
    cvAttenuation: cvAttenuation[0],
    resCvAttenuation: resCvAttenuation[0],
  }))

  const [cutoff, setCutoff] = useState([initialParameters?.cutoff ?? 1.0])
  const [resonance, setResonance] = useState([
    initialParameters?.resonance ?? 0.0,
  ])
  const [cvAttenuation, setCvAttenuation] = useState([
    initialParameters?.cvAttenuation ?? 1,
  ])
  const [resCvAttenuation, setResCvAttenuation] = useState([
    initialParameters?.resCvAttenuation ?? 1,
  ])

  const acRef = useRef<AudioContext | null>(null)

  // Input gain node as the *actual port* node
  const audioInRef = useRef<GainNode | null>(null)

  const cutoffCVInRef = useRef<GainNode | null>(null)
  const resCVInRef = useRef<GainNode | null>(null)

  const workletRef = useRef<AudioWorkletNode | null>(null)
  const outRef = useRef<GainNode | null>(null)

  const { registerAudioNode } = useConnections()

  // ---- helpers --------------------------------------------------------------
  const setMono = (node: AudioNode) => {
    try {
      ;(node as any).channelCount = 1
      ;(node as any).channelCountMode = 'explicit'
      ;(node as any).channelInterpretation = 'discrete'
    } catch {}
  }

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

  // Update parameters via useEffect like other modules
  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const cutHz = utils.mapLogarithmic(
      Math.max(0.0001, cutoff[0]),
      MIN_CUTOFF,
      MAX_CUTOFF,
    )
    w.parameters.get('cutoff')?.setTargetAtTime(cutHz, ac.currentTime, 0.05) // Slower for stability
  }, [cutoff])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const resNorm = Math.min(0.995, clamp01(resonance[0]) ** 0.95)
    w.parameters
      .get('resonance')
      ?.setTargetAtTime(resNorm, ac.currentTime, 0.05) // Slower for stability
  }, [resonance])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    // CV attenuation is handled in the worklet
    w.parameters
      .get('cvAmount')
      ?.setTargetAtTime(cvAttenuation[0], ac.currentTime, 0.05)
  }, [cvAttenuation])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    // Resonance CV attenuation is handled in the worklet
    w.parameters
      .get('resCvAmount')
      ?.setTargetAtTime(resCvAttenuation[0], ac.currentTime, 0.05)
  }, [resCvAttenuation])

  useModuleInit(async () => {
    if (workletRef.current) return // Already initialized

    const ac = getAudioContext()
    acRef.current = ac

    await ac.audioWorklet.addModule('/ladder-filter-processor.js')

    // Input as port (mono)
    audioInRef.current = ac.createGain()
    setMono(audioInRef.current)
    audioInRef.current.gain.value = 1

    // Register input with new system
    registerAudioNode(`${moduleId}-audio-in`, audioInRef.current, 'input')

    // CV inputs - connect directly to worklet for audio-rate modulation
    cutoffCVInRef.current = ac.createGain()
    cutoffCVInRef.current.gain.value = 1
    resCVInRef.current = ac.createGain()
    resCVInRef.current.gain.value = 1
    registerAudioNode(
      `${moduleId}-cutoff-cv-in`,
      cutoffCVInRef.current,
      'input',
    )
    registerAudioNode(
      `${moduleId}-resonance-cv-in`,
      resCVInRef.current,
      'input',
    )

    // Worklet with CV inputs
    const initCut = utils.mapLogarithmic(
      Math.max(0.0001, cutoff[0]),
      MIN_CUTOFF,
      MAX_CUTOFF,
    )
    workletRef.current = new AudioWorkletNode(ac, 'ladder-filter-processor', {
      numberOfInputs: 3, // audio, cutoff CV, resonance CV
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      parameterData: {
        cutoff: initCut,
        resonance: clamp01(resonance[0]),
        cvAmount: cvAttenuation[0],
        resCvAmount: resCvAttenuation[0],
      },
    } as any)

    // Connect audio and CV inputs to worklet
    audioInRef.current.connect(workletRef.current, 0, 0) // audio input
    cutoffCVInRef.current.connect(workletRef.current, 0, 1) // cutoff CV
    resCVInRef.current.connect(workletRef.current, 0, 2) // resonance CV

    // Output (mono) + register as port
    outRef.current = ac.createGain()
    setMono(outRef.current)
    outRef.current.gain.value = 1
    workletRef.current.connect(outRef.current)
    registerAudioNode(`${moduleId}-audio-out`, outRef.current, 'output')
  }, moduleId)

  return (
    <ModuleContainer title="Filter" moduleId={moduleId}>
      <div className="flex flex-col items-center justify-center gap-8 flex-1">
        <Knob
          value={cutoff}
          onValueChange={setCutoff}
          size="lg"
          data-param="cutoff"
          label="Cutoff"
        />
        <Knob
          value={resonance}
          onValueChange={setResonance}
          size="md"
          data-param="resonance"
          label="Res"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end gap-0">
          <div className="flex flex-col items-center gap-2">
            <Knob
              value={cvAttenuation}
              onValueChange={setCvAttenuation}
              size="xs"
              data-param="cvAttenuation"
            />
            <Port
              id={`${moduleId}-cutoff-cv-in`}
              type="input"
              label="CUTOFF"
              audioType="cv"
              audioNode={cutoffCVInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob
              value={resCvAttenuation}
              onValueChange={setResCvAttenuation}
              size="xs"
              data-param="resCvAttenuation"
            />
            <Port
              id={`${moduleId}-resonance-cv-in`}
              type="input"
              label="RES"
              audioType="cv"
              audioNode={resCVInRef.current ?? undefined}
            />
          </div>
        </div>
        <div className="flex justify-center">
          <Port
            id={`${moduleId}-audio-in`}
            type="input"
            label="IN"
            audioType="audio"
            audioNode={audioInRef.current ?? undefined}
          />
          <PortGroup>
            <Port
              id={`${moduleId}-audio-out`}
              type="output"
              label="OUT"
              audioType="audio"
              audioNode={outRef.current ?? undefined}
            />
          </PortGroup>
        </div>
      </div>
    </ModuleContainer>
  )
}
