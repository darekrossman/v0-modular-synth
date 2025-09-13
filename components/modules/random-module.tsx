'use client'

import { ArrowDown, MoveDown } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { mapLinear } from '@/lib/utils'
import { TextLabel } from '../text-label'

export function RandomModule({ moduleId }: { moduleId: string }) {
  const { initialParameters } = useModulePatch(moduleId, () => ({
    atten,
    offset,
  }))

  const ensureLen = (
    arr: number[][] | undefined,
    len: number,
    fill: number,
  ): number[][] => {
    const result: number[][] = []
    for (let i = 0; i < len; i++) {
      const v = arr?.[i]?.[0]
      result[i] = [typeof v === 'number' ? v : fill]
    }
    return result
  }

  const [atten, setAtten] = useState(
    ensureLen(initialParameters?.atten, 8, 1) as number[][],
  )
  const [offset, setOffset] = useState(
    ensureLen(initialParameters?.offset, 8, 0.5) as number[][],
  )

  const audioContextRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)

  const trigIn1Ref = useRef<GainNode | null>(null)
  const trigIn2Ref = useRef<GainNode | null>(null)
  const trigIn3Ref = useRef<GainNode | null>(null)
  const trigIn4Ref = useRef<GainNode | null>(null)
  const trigIn5Ref = useRef<GainNode | null>(null)
  const trigIn6Ref = useRef<GainNode | null>(null)
  const trigIn7Ref = useRef<GainNode | null>(null)
  const trigIn8Ref = useRef<GainNode | null>(null)
  const trigIn = [
    trigIn1Ref,
    trigIn2Ref,
    trigIn3Ref,
    trigIn4Ref,
    trigIn5Ref,
    trigIn6Ref,
    trigIn7Ref,
    trigIn8Ref,
  ]

  const cvOut1Ref = useRef<GainNode | null>(null)
  const cvOut2Ref = useRef<GainNode | null>(null)
  const cvOut3Ref = useRef<GainNode | null>(null)
  const cvOut4Ref = useRef<GainNode | null>(null)
  const cvOut5Ref = useRef<GainNode | null>(null)
  const cvOut6Ref = useRef<GainNode | null>(null)
  const cvOut7Ref = useRef<GainNode | null>(null)
  const cvOut8Ref = useRef<GainNode | null>(null)
  const cvOut = [
    cvOut1Ref,
    cvOut2Ref,
    cvOut3Ref,
    cvOut4Ref,
    cvOut5Ref,
    cvOut6Ref,
    cvOut7Ref,
    cvOut8Ref,
  ]

  const paramName = (kind: 'atten' | 'offset', idx: number) =>
    `${kind}${idx + 1}` as const

  const setAttenIdx = (idx: number) => (v: number[]) => {
    setAtten((prev: number[][]) => {
      const next = [...prev]
      next[idx] = v
      return next
    })
    const ac = audioContextRef.current
    const node = workletRef.current
    if (ac && node) {
      node.parameters
        .get(paramName('atten', idx))
        ?.setValueAtTime(v[0] ?? 0, ac.currentTime)
    }
  }

  const setOffsetIdx = (idx: number) => (v: number[]) => {
    // map 0..1 -> -5..+5
    const volts = mapLinear(v[0] ?? 0, -5, 5)
    setOffset((prev: number[][]) => {
      const next = [...prev]
      next[idx] = v
      return next
    })
    const ac = audioContextRef.current
    const node = workletRef.current
    if (ac && node) {
      node.parameters
        .get(paramName('offset', idx))
        ?.setValueAtTime(volts, ac.currentTime)
    }
  }

  useModuleInit(async () => {
    if (workletRef.current) return
    const ac = getAudioContext()
    audioContextRef.current = ac

    // Load the worklet file you added above
    await ac.audioWorklet.addModule('/random-processor.js')

    const node = new AudioWorkletNode(ac, 'random-processor', {
      numberOfInputs: 8,
      numberOfOutputs: 8,
      outputChannelCount: [1, 1, 1, 1, 1, 1, 1, 1],
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
        atten7: atten[6][0],
        offset7: mapLinear(offset[6][0], -5, 5),
        atten8: atten[7][0],
        offset8: mapLinear(offset[7][0], -5, 5),
      },
    })
    workletRef.current = node

    // Create ports: triggers (inputs)
    for (let i = 0; i < 8; i++) {
      const gIn = ac.createGain()
      gIn.gain.value = 1
      trigIn[i].current = gIn
      // connect trigger inputs into the worklet inputs
      gIn.connect(node, 0, i)
    }

    // Create outputs and register; drive them from the worklet outputs
    for (let i = 0; i < 8; i++) {
      const gOut = ac.createGain()
      gOut.gain.value = 1
      node.connect(gOut, i, 0)
      cvOut[i].current = gOut
    }

    // Keep-alive: ensure processing even with no external connections
    const sink = ac.createGain()
    sink.gain.value = 0
    cvOut[0].current?.connect(sink)
    sink.connect(ac.destination)
  }, moduleId)

  return (
    <ModuleContainer title="Random" moduleId={moduleId}>
      <div className="mt-4 mb-1 self-start ml-2">
        <TextLabel variant="control">Trig</TextLabel>
      </div>
      <div className="flex flex-col flex-1 justify-between">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="contents">
            {i > 0 && <MoveDown className="size-3 ml-3.5" />}
            <div className="flex items-center justify-between">
              <Port
                id={`${moduleId}-trigger-in-${i + 1}`}
                type="input"
                audioType="cv"
                audioNode={trigIn[i].current ?? undefined}
              />
              {/* <Knob
                defaultValue={atten[i]}
                onValueChange={setAttenIdx(i)}
                label="lvl"
                size="xs"
                className="mt-[-16px] mr-1 ml-[-6px]"
              /> */}
              {/* <Knob
                defaultValue={offset[i]}
                onValueChange={setOffsetIdx(i)}
                label="oset"
                size="xs"
                className="mt-[-16px]"
              /> */}
              <PortGroup>
                <Port
                  id={`${moduleId}-cv-out-${i + 1}`}
                  type="output"
                  audioType="cv"
                  audioNode={cvOut[i].current ?? undefined}
                />
              </PortGroup>
            </div>
          </div>
        ))}
      </div>
    </ModuleContainer>
  )
}
