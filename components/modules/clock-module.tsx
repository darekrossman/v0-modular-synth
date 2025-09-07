'use client'

import { useCallback, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { cn, mapLinear } from '@/lib/utils'
import { HLine } from '../marks'
import { TextLabel } from '../text-label'
import { Toggle } from '../ui/toggle'

export function ClockModule({ moduleId }: { moduleId: string }) {
  const [bpm, setBpm] = useState([120])
  const [isRunning, setIsRunning] = useState(false)
  const [div1, setDiv1] = useState([3 / 8]) // defaults around 1/4
  const [div2, setDiv2] = useState([4 / 8]) // 1/2
  const [div3, setDiv3] = useState([5 / 8]) // 1/1
  const [div4, setDiv4] = useState([6 / 8]) // 2/1

  const audioContextRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)

  // Outputs: [0]=48ppq, [1..4]=DIV1..DIV4
  const ppq48OutRef = useRef<GainNode | null>(null)
  const div1OutRef = useRef<GainNode | null>(null)
  const div2OutRef = useRef<GainNode | null>(null)
  const div3OutRef = useRef<GainNode | null>(null)
  const div4OutRef = useRef<GainNode | null>(null)

  const keepAliveRef = useRef<GainNode | null>(null)

  useModuleInit(async () => {
    if (nodeRef.current) return

    const ac = getAudioContext()
    audioContextRef.current = ac

    await ac.audioWorklet.addModule('/clock-processor.js')

    const node = new AudioWorkletNode(ac, 'clock-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 5,
      outputChannelCount: [1, 1, 1, 1, 1],
      parameterData: {
        bpm: bpm[0],
        // send selector indices (0..8)
        div1: 3, // 1/4
        div2: 4, // 1/2
        div3: 5, // 1/1
        div4: 6, // 2/1
      },
    })
    nodeRef.current = node

    // Route outputs
    const mk = () => ac.createGain()
    const ppq = mk()
    ppq.gain.value = 1
    node.connect(ppq, 0, 0)
    ppq48OutRef.current = ppq
    const d1 = mk()
    d1.gain.value = 1
    node.connect(d1, 1, 0)
    div1OutRef.current = d1
    const d2 = mk()
    d2.gain.value = 1
    node.connect(d2, 2, 0)
    div2OutRef.current = d2
    const d3 = mk()
    d3.gain.value = 1
    node.connect(d3, 3, 0)
    div3OutRef.current = d3
    const d4 = mk()
    d4.gain.value = 1
    node.connect(d4, 4, 0)
    div4OutRef.current = d4

    // keep-alive
    const sink = ac.createGain()
    sink.gain.value = 0
    ppq.connect(sink)
    sink.connect(ac.destination)
    keepAliveRef.current = sink

    node.port.postMessage({ type: 'running', value: false })
    console.log('[clock] initialized')
  }, moduleId)

  const startClock = useCallback(() => {
    const node = nodeRef.current
    if (!node) return
    node.port.postMessage({ type: 'reset' })
    node.port.postMessage({ type: 'running', value: true })
  }, [])

  const stopClock = useCallback(() => {
    const node = nodeRef.current
    if (!node) return
    node.port.postMessage({ type: 'running', value: false })
  }, [])

  const handleStartStop = useCallback(() => {
    setIsRunning((prev) => {
      const next = !prev
      next ? startClock() : stopClock()
      return next
    })
  }, [startClock, stopClock])

  // Tempo mapping (0..1 -> 0..300 BPM, clamped to 0.1+)
  const handleKnobChange = useCallback((value: number[]) => {
    const raw01 = value[0] ?? 0
    const rawBpm = mapLinear(raw01, 20, 280)
    const clamped = Math.min(280, Math.max(20, rawBpm))
    const quantized = Math.round(clamped * 2) / 2 // increments of 0.5 BPM
    setBpm([quantized])
    const ac = audioContextRef.current
    const node = nodeRef.current
    if (ac && node)
      node.parameters.get('bpm')?.setValueAtTime(quantized, ac.currentTime)
  }, [])

  // Selector labels and handlers
  const divisionLabels = [
    '1/32',
    '1/16',
    '1/8',
    '1/4',
    '1/2',
    '1/1',
    '2/1',
    '4/1',
    '8/1',
  ]
  const SEL_COUNT = divisionLabels.length

  const getDivisionLabel = (val: number[]) => {
    const v01 = val[0] ?? 0
    const idx = Math.round(v01 * (SEL_COUNT - 1))
    return divisionLabels[idx]
  }

  const makeDivHandler =
    (paramName: string, setState: (v: number[]) => void) =>
    (value: number[]) => {
      const v01 = value[0] ?? 0
      const idx = Math.round(v01 * (SEL_COUNT - 1)) // 0..8
      setState([v01])
      const ac = audioContextRef.current
      const node = nodeRef.current
      if (ac && node)
        node.parameters.get(paramName)?.setValueAtTime(idx, ac.currentTime)
    }

  const handleDiv1Change = useCallback(makeDivHandler('div1', setDiv1), [])
  const handleDiv2Change = useCallback(makeDivHandler('div2', setDiv2), [])
  const handleDiv3Change = useCallback(makeDivHandler('div3', setDiv3), [])
  const handleDiv4Change = useCallback(makeDivHandler('div4', setDiv4), [])

  const defaultKnobValue = [(120 - 20) / (280 - 20)]

  const divisionControls = [
    {
      id: 'div1',
      default: 3 / 8,
      value: div1,
      onChange: handleDiv1Change,
      outRef: div1OutRef,
    },
    {
      id: 'div2',
      default: 4 / 8,
      value: div2,
      onChange: handleDiv2Change,
      outRef: div2OutRef,
    },
    {
      id: 'div3',
      default: 5 / 8,
      value: div3,
      onChange: handleDiv3Change,
      outRef: div3OutRef,
    },
    {
      id: 'div4',
      default: 6 / 8,
      value: div4,
      onChange: handleDiv4Change,
      outRef: div4OutRef,
    },
  ] as const

  return (
    <ModuleContainer title="Clock" moduleId={moduleId}>
      <div className="flex flex-col items-center gap-6 w-full">
        <div className="flex items-center justify-center h-7 bg-black text-yellow-500 text-shadow-[0_0_6px_var(--color-yellow-600)] font-mono text-md rounded-sm w-full text-center">
          {bpm[0].toFixed(1)} BPM
        </div>

        <div className="flex-1 flex justify-center items-center gap-8 px-2">
          <div className="flex flex-col items-center justify-center gap-2">
            <TextLabel variant="control">
              {isRunning ? 'stop' : 'run'}
            </TextLabel>
            <Toggle
              pressed={isRunning}
              size="lg"
              onClick={handleStartStop}
              variant="push"
            />
          </div>
          <Knob
            defaultValue={defaultKnobValue}
            onValueChange={handleKnobChange}
            label="Tempo"
            size="md"
            turnSpeed="slow"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-6">
        <div className="">
          <TextLabel variant="control">Dividers</TextLabel>
        </div>
        <div className="flex flex-col gap-5 py-3 border-b border-t border-module-subdued">
          {divisionControls.map((d, i) => (
            <div key={d.id} className="flex items-center justify-between">
              <div className="size-10 flex items-center justify-center">
                <Knob
                  defaultValue={[d.default]}
                  onValueChange={d.onChange}
                  size="sm"
                  showTicks={false}
                  steps={SEL_COUNT}
                />
              </div>
              <div className="flex items-center">
                <HLine className="w-3" />
                <div className="w-8 py-1 rounded-sm bg-module-foreground text-yellow-500 dark:text-module-background">
                  <TextLabel variant="control">
                    {getDivisionLabel(d.value)}
                  </TextLabel>
                </div>
                <HLine className="w-3" />
              </div>
              <PortGroup>
                <Port
                  id={`${moduleId}-${d.id}-out`}
                  type="output"
                  audioType="cv"
                  audioNode={d.outRef.current ?? undefined}
                />
              </PortGroup>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-grow" />

      <div className="flex justify-end items-end">
        <PortGroup>
          <Port
            id={`${moduleId}-48ppq-out`}
            type="output"
            label="clk"
            audioType="cv"
            audioNode={ppq48OutRef.current ?? undefined}
          />
        </PortGroup>
      </div>
    </ModuleContainer>
  )
}
