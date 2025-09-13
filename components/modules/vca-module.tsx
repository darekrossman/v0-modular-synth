'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { mapLinear } from '@/lib/utils'
import { VLine } from '../marks'
import { TextLabel } from '../text-label'
import { Slider } from '../ui/slider'

export function VCAModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    cvAmount: cvAmount[0],
    offset: offset[0],
  }))

  // UI knobs are 0..1
  const [cvAmount, setCvAmount] = useState([initialParameters?.cvAmount ?? 1.0]) // 0..1 attenuator
  const [offset, setOffset] = useState([initialParameters?.offset ?? 0.0]) // 0..1 base gain

  const audioContextRef = useRef<AudioContext | null>(null)
  const audioInRef = useRef<GainNode | null>(null)
  const cvInRef = useRef<GainNode | null>(null)
  const cvAmtInRef = useRef<GainNode | null>(null)
  const vcaNodeRef = useRef<AudioWorkletNode | null>(null)
  const audioOutRef = useRef<GainNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)

  useModuleInit(async () => {
    if (vcaNodeRef.current) return // Already initialized

    const ac = getAudioContext()
    audioContextRef.current = ac

    await ac.audioWorklet.addModule('/vca-processor.js')

    audioInRef.current = ac.createGain()
    audioInRef.current.gain.value = 1

    cvInRef.current = ac.createGain()
    cvInRef.current.gain.value = 1 // treat 1.0 in buffer == 1 V in our CV domain

    cvAmtInRef.current = ac.createGain()
    cvAmtInRef.current.gain.value = 1

    audioOutRef.current = ac.createGain()
    audioOutRef.current.gain.value = 1

    const node = new AudioWorkletNode(ac, 'vca-processor', {
      numberOfInputs: 3,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        offset: mapLinear(offset[0], 0, 1),
        cvAmount: mapLinear(cvAmount[0], 0, 1),
        slewMs: 1,
        dcBlock: 1,
        dcCutHz: 5,
        hardGateDb: -90,
        sat: 0.0,
      },
    })
    vcaNodeRef.current = node

    audioInRef.current.connect(node, 0, 0)
    cvInRef.current.connect(node, 0, 1)
    cvAmtInRef.current.connect(node, 0, 2)
    node.connect(audioOutRef.current)

    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    audioOutRef.current.connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)
  }, moduleId)

  useEffect(() => {
    const ac = audioContextRef.current,
      node = vcaNodeRef.current
    if (ac && node)
      node.parameters
        .get('cvAmount')
        ?.setValueAtTime(mapLinear(cvAmount[0], 0, 1), ac.currentTime)
  }, [cvAmount])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = vcaNodeRef.current
    if (ac && node)
      node.parameters
        .get('offset')
        ?.setValueAtTime(mapLinear(offset[0], 0, 1), ac.currentTime)
  }, [offset])

  return (
    <ModuleContainer title="VCA" moduleId={moduleId} data-module-id={moduleId}>
      <div className="flex flex-col flex-1 justify-start items-center gap-3 mt-4 mb-9">
        <Slider
          value={offset}
          onValueChange={setOffset}
          orientation="vertical"
          size="md"
          min={0}
          max={1}
          step={0.01}
        />
        <TextLabel variant="control" className="text-[10px]">
          Offset
        </TextLabel>
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="flex flex-col items-center gap-1">
          <div className="flex flex-col items-center gap-3">
            <Knob value={cvAmount} onValueChange={setCvAmount} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-cv-in`}
              type="input"
              label="CV"
              audioType="cv"
              audioNode={cvInRef.current ?? undefined}
            />
          </div>
          <Port
            id={`${moduleId}-cv-amt-in`}
            type="input"
            label="Lvl"
            audioType="cv"
            audioNode={cvAmtInRef.current ?? undefined}
          />
        </div>
        <Port
          id={`${moduleId}-audio-in`}
          type="input"
          label="IN"
          audioType="audio"
          audioNode={audioInRef.current ?? undefined}
        />
        <PortGroup className="flex-col gap-1">
          <Port
            id={`${moduleId}-audio-out`}
            type="output"
            label="OUT"
            audioType="audio"
            audioNode={audioOutRef.current ?? undefined}
          />
        </PortGroup>
      </div>
    </ModuleContainer>
  )
}
