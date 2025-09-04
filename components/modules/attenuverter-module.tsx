'use client'

import { useEffect, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port } from '@/components/port'
import { TextLabel } from '@/components/text-label'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'

export function AttenuverterModule({ moduleId }: { moduleId: string }) {
  // Get initial parameters and set up persistence
  const { initialParameters } = useModulePatch(moduleId, () => ({
    gains: gains,
  }))

  // Initialize gains with saved values or defaults
  const [gains, setGains] = useState<number[]>(
    Array.isArray(initialParameters?.gains) &&
      initialParameters?.gains.length === 6
      ? (initialParameters.gains as number[])
      : [0, 0, 0, 0, 0, 0],
  )

  const audioContextRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const inRefs = useRef<GainNode[]>([])
  const outRefs = useRef<GainNode[]>([])
  const { connections } = useConnections()

  // Initialize audio graph
  useModuleInit(async () => {
    if (workletRef.current) return // Already initialized

    const ac = getAudioContext()
    audioContextRef.current = ac

    await ac.audioWorklet.addModule('/attenuverter-processor.js')
    
    // Check initial connections for mask parameters
    const masks = Array.from({ length: 6 }, (_, i) =>
      connections.some(c => c.to === `${moduleId}-in-${i + 1}`) ? 1 : 0
    )

    // Create the worklet node with initial parameters
    const node = new AudioWorkletNode(ac, 'attenuverter-processor', {
      numberOfInputs: 6,
      numberOfOutputs: 6,
      outputChannelCount: [1, 1, 1, 1, 1, 1],
      parameterData: {
        g0: gains[0],
        g1: gains[1],
        g2: gains[2],
        g3: gains[3],
        g4: gains[4],
        g5: gains[5],
        m0: masks[0],
        m1: masks[1],
        m2: masks[2],
        m3: masks[3],
        m4: masks[4],
        m5: masks[5],
      },
    })
    workletRef.current = node
    
    // Explicitly set all parameters to activate them
    for (let i = 0; i < 6; i++) {
      node.parameters.get(`g${i}`)?.setValueAtTime(gains[i], ac.currentTime)
      node.parameters.get(`m${i}`)?.setValueAtTime(masks[i], ac.currentTime)
    }

    // Create input gain nodes and connect to worklet
    for (let i = 0; i < 6; i++) {
      const inGain = ac.createGain()
      inGain.gain.value = 1
      inRefs.current[i] = inGain
      inGain.connect(node, 0, i)
    }

    // Create output gain nodes and connect from worklet
    for (let i = 0; i < 6; i++) {
      const outGain = ac.createGain()
      outGain.gain.value = 1
      node.connect(outGain, i, 0)
      outRefs.current[i] = outGain
    }

    // Keep-alive: ensure processing even with no external connections
    const sink = ac.createGain()
    sink.gain.value = 0
    outRefs.current[0].connect(sink)
    sink.connect(ac.destination)
  }, moduleId)
  
  // Update mask parameters when connections change
  useEffect(() => {
    const ac = audioContextRef.current
    const node = workletRef.current
    if (!ac || !node) return
    
    // Update mask for each input based on connections
    for (let i = 0; i < 6; i++) {
      const isConnected = connections.some(c => c.to === `${moduleId}-in-${i + 1}`)
      node.parameters.get(`m${i}`)?.setValueAtTime(isConnected ? 1 : 0, ac.currentTime)
    }
  }, [connections, moduleId])

  // Update gain when knob changes
  const setGainAtIndex = (index: number) => (value: number[]) => {
    const newValue = Array.isArray(value) ? value[0] : value
    const mapped = (newValue - 0.5) * 2 // Map 0..1 to -1..1

    setGains((prev) => {
      const next = [...prev]
      next[index] = mapped
      return next
    })

    const ac = audioContextRef.current
    const node = workletRef.current
    if (ac && node) {
      node.parameters.get(`g${index}`)?.setValueAtTime(mapped, ac.currentTime)
    }
  }

  return (
    <ModuleContainer title="Attenuverter" moduleId={moduleId}>
      <div className="flex flex-col gap-3 py-2">
        <div className="grid gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3"
            >
              <Port
                id={`${moduleId}-in-${i + 1}`}
                type="input"
                label={`IN${i + 1}`}
                audioType="any"
                audioNode={inRefs.current[i] ?? undefined}
              />
              <div className="flex flex-col items-center gap-1 py-1">
                <Knob
                  size="sm"
                  defaultValue={[gains[i] / 2 + 0.5]}
                  onValueChange={setGainAtIndex(i)}
                  label={`Ch ${i + 1}`}
                />
                <TextLabel variant="control" className="text-[10px]">
                  -1 .. 1
                </TextLabel>
              </div>
              <Port
                id={`${moduleId}-out-${i + 1}`}
                type="output"
                label={`OUT${i + 1}`}
                audioType="any"
                audioNode={outRefs.current[i] ?? undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </ModuleContainer>
  )
}
