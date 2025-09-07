'use client'

import { useEffect, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import * as utils from '@/lib/utils'
import { VLine } from '../marks'

const MIN_CUTOFF = 20
const MAX_CUTOFF = 12000

export function SVFFilterModule({ moduleId }: { moduleId: string }) {
  const { initialParameters } = useModulePatch(moduleId, () => ({
    cutoff: cutoff[0],
    resonance: resonance[0],
    drive: drive[0],
    cutoffCvAmt: cutoffCvAmt[0],
    resCvAmt: resCvAmt[0],
    driveCvAmt: driveCvAmt[0],
  }))

  const [cutoff, setCutoff] = useState([initialParameters?.cutoff ?? 1.0])
  const [resonance, setResonance] = useState([
    initialParameters?.resonance ?? 0.0,
  ])
  const [drive, setDrive] = useState([initialParameters?.drive ?? 0.0])

  const [cutoffCvAmt, setCutoffCvAmt] = useState([
    initialParameters?.cutoffCvAmt ?? 1.0,
  ])
  const [resCvAmt, setResCvAmt] = useState([initialParameters?.resCvAmt ?? 1.0])
  const [driveCvAmt, setDriveCvAmt] = useState([
    initialParameters?.driveCvAmt ?? 1.0,
  ])

  const acRef = useRef<AudioContext | null>(null)

  const audioInRef = useRef<GainNode | null>(null)
  const cutoffCVInRef = useRef<GainNode | null>(null)
  const resCVInRef = useRef<GainNode | null>(null)
  const driveCVInRef = useRef<GainNode | null>(null)

  const workletRef = useRef<AudioWorkletNode | null>(null)
  const lpOutRef = useRef<GainNode | null>(null)
  const hpOutRef = useRef<GainNode | null>(null)

  const { registerAudioNode } = useConnections()

  const setMono = (node: AudioNode) => {
    try {
      ;(node as any).channelCount = 1
      ;(node as any).channelCountMode = 'explicit'
      ;(node as any).channelInterpretation = 'discrete'
    } catch {}
  }

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const cutHz = utils.mapLogarithmic(
      Math.max(0.0001, cutoff[0]),
      MIN_CUTOFF,
      MAX_CUTOFF,
    )
    w.parameters.get('cutoff')?.setTargetAtTime(cutHz, ac.currentTime, 0.03)
  }, [cutoff])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const r = clamp01(resonance[0])
    w.parameters.get('resonance')?.setTargetAtTime(r, ac.currentTime, 0.03)
  }, [resonance])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const d = clamp01(drive[0])
    w.parameters.get('drive')?.setTargetAtTime(d, ac.currentTime, 0.03)
  }, [drive])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    w.parameters
      .get('cutoffCvAmt')
      ?.setTargetAtTime(cutoffCvAmt[0], ac.currentTime, 0.03)
  }, [cutoffCvAmt])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    w.parameters
      .get('resCvAmt')
      ?.setTargetAtTime(resCvAmt[0], ac.currentTime, 0.03)
  }, [resCvAmt])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    w.parameters
      .get('driveCvAmt')
      ?.setTargetAtTime(driveCvAmt[0], ac.currentTime, 0.03)
  }, [driveCvAmt])

  useModuleInit(async () => {
    if (workletRef.current) return

    const ac = getAudioContext()
    acRef.current = ac

    await ac.audioWorklet.addModule('/svf-filter-processor.js')

    audioInRef.current = ac.createGain()
    setMono(audioInRef.current)
    audioInRef.current.gain.value = 1
    registerAudioNode(`${moduleId}-audio-in`, audioInRef.current, 'input')

    cutoffCVInRef.current = ac.createGain()
    cutoffCVInRef.current.gain.value = 1
    registerAudioNode(
      `${moduleId}-cutoff-cv-in`,
      cutoffCVInRef.current,
      'input',
    )

    resCVInRef.current = ac.createGain()
    resCVInRef.current.gain.value = 1
    registerAudioNode(
      `${moduleId}-resonance-cv-in`,
      resCVInRef.current,
      'input',
    )

    driveCVInRef.current = ac.createGain()
    driveCVInRef.current.gain.value = 1
    registerAudioNode(`${moduleId}-drive-cv-in`, driveCVInRef.current, 'input')

    const initCut = utils.mapLogarithmic(
      Math.max(0.0001, cutoff[0]),
      MIN_CUTOFF,
      MAX_CUTOFF,
    )

    const w = new AudioWorkletNode(ac, 'svf-filter-processor', {
      numberOfInputs: 4,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      parameterData: {
        cutoff: initCut,
        resonance: clamp01(resonance[0]),
        drive: clamp01(drive[0]),
        cutoffCvAmt: clamp01(cutoffCvAmt[0]),
        resCvAmt: clamp01(resCvAmt[0]),
        driveCvAmt: clamp01(driveCvAmt[0]),
      },
    } as any)
    workletRef.current = w

    audioInRef.current.connect(w, 0, 0)
    cutoffCVInRef.current.connect(w, 0, 1)
    resCVInRef.current.connect(w, 0, 2)
    driveCVInRef.current.connect(w, 0, 3)

    lpOutRef.current = ac.createGain()
    setMono(lpOutRef.current)
    lpOutRef.current.gain.value = 1
    w.connect(lpOutRef.current, 0, 0)
    registerAudioNode(`${moduleId}-lp-out`, lpOutRef.current, 'output')

    hpOutRef.current = ac.createGain()
    setMono(hpOutRef.current)
    hpOutRef.current.gain.value = 1
    w.connect(hpOutRef.current, 1, 0)
    registerAudioNode(`${moduleId}-hp-out`, hpOutRef.current, 'output')
  }, moduleId)

  return (
    <ModuleContainer title="SVF Filter" moduleId={moduleId}>
      <div className="flex flex-col items-center justify-center px-3 gap-6 flex-1">
        <Knob
          value={cutoff}
          onValueChange={setCutoff}
          size="lg"
          data-param="cutoff"
          label="Cutoff"
        />
        <div className="flex gap-6">
          <Knob
            value={resonance}
            onValueChange={setResonance}
            size="md"
            data-param="resonance"
            label="Res"
          />
          <Knob
            value={drive}
            onValueChange={setDrive}
            size="md"
            data-param="drive"
            label="Drive"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between items-end gap-0">
          <div className="flex flex-col items-center gap-3">
            <Knob
              value={cutoffCvAmt}
              onValueChange={setCutoffCvAmt}
              size="xs"
            />
            <VLine />
            <Port
              id={`${moduleId}-cutoff-cv-in`}
              type="input"
              label="freq"
              audioType="cv"
              audioNode={cutoffCVInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={resCvAmt} onValueChange={setResCvAmt} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-resonance-cv-in`}
              type="input"
              label="RES"
              audioType="cv"
              audioNode={resCVInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={driveCvAmt} onValueChange={setDriveCvAmt} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-drive-cv-in`}
              type="input"
              label="DRV"
              audioType="cv"
              audioNode={driveCVInRef.current ?? undefined}
            />
          </div>
        </div>
        <div className="flex justify-between">
          <Port
            id={`${moduleId}-audio-in`}
            type="input"
            label="IN"
            audioType="audio"
            audioNode={audioInRef.current ?? undefined}
          />
          <PortGroup>
            <Port
              id={`${moduleId}-lp-out`}
              type="output"
              label="LP"
              audioType="audio"
              audioNode={lpOutRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-hp-out`}
              type="output"
              label="HP"
              audioType="audio"
              audioNode={hpOutRef.current ?? undefined}
            />
          </PortGroup>
        </div>
      </div>
    </ModuleContainer>
  )
}
