'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { Slider } from '@/components/ui/slider'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { TextLabel } from '../text-label'
import { ToggleSwitch } from '../ui/toggle-switch'

export function MixerVCAModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    chanLevels,
    mixLevel: mixLevel[0],
    expo,
  }))

  const [chanLevels, setChanLevels] = useState<
    [number, number, number, number]
  >(
    (initialParameters?.chanLevels as [number, number, number, number]) ?? [
      0.75, 0.75, 0.75, 0.75,
    ],
  )
  // Mix knob raw 0..1; processor maps 0.5 => 1x, 1.0 => 2x (~+6 dB)
  const [mixLevel, setMixLevel] = useState<number[]>([
    initialParameters?.mixLevel ?? 0.5,
  ])
  const [expo, setExpo] = useState<boolean>(initialParameters?.expo ?? false)

  const acRef = useRef<AudioContext | null>(null)
  const chInRef = useRef<GainNode[]>([])
  const chCvRef = useRef<GainNode[]>([])
  const chOutRef = useRef<GainNode[]>([])
  const mixCvRef = useRef<GainNode | null>(null)
  const mixOutRef = useRef<GainNode | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)
  const mixCvConnectedRef = useRef(false)
  const { connections } = useConnections()
  const chCvConnectedRef = useRef<[boolean, boolean, boolean, boolean]>([
    false,
    false,
    false,
    false,
  ])
  const [nodeReady, setNodeReady] = useState(false)

  useModuleInit(async () => {
    if (nodeRef.current) return
    const ac = getAudioContext()
    acRef.current = ac
    await ac.audioWorklet.addModule('/mixer-vca-processor.js')

    // IO nodes
    chInRef.current = Array.from({ length: 4 }, () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    })
    chCvRef.current = Array.from({ length: 4 }, () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    })
    chOutRef.current = Array.from({ length: 4 }, () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    })
    mixCvRef.current = ac.createGain()
    mixCvRef.current.gain.value = 1
    mixOutRef.current = ac.createGain()
    mixOutRef.current.gain.value = 1

    const node = new AudioWorkletNode(ac, 'mixer-vca-processor', {
      numberOfInputs: 9,
      numberOfOutputs: 5,
      outputChannelCount: [1, 1, 1, 1, 1],
      parameterData: {
        // Per-channel VCA: base offset 0, full amount (sliders won't change these)
        ch0Offset: 0,
        ch0Amount: 1,
        ch1Offset: 0,
        ch1Amount: 1,
        ch2Offset: 0,
        ch2Amount: 1,
        ch3Offset: 0,
        ch3Amount: 1,
        // Post-VCA mix levels driven by sliders
        ch0Mix: chanLevels[0],
        ch1Mix: chanLevels[1],
        ch2Mix: chanLevels[2],
        ch3Mix: chanLevels[3],
        mixOffset: mixLevel[0],
        mixAmount: 1,
        mixKnob: mixLevel[0],
        expo: expo ? 1 : 0,
        slewMs: 1,
        dcBlock: 1,
        dcCutHz: 5,
        hardGateDb: -90,
      },
    })
    nodeRef.current = node

    for (let i = 0; i < 4; i++) {
      chInRef.current[i].connect(node, 0, i)
    }
    // Do not connect mix CV to the processor here; we'll connect only when a cable is present
    node.connect(chOutRef.current[0], 0)
    node.connect(chOutRef.current[1], 1)
    node.connect(chOutRef.current[2], 2)
    node.connect(chOutRef.current[3], 3)
    node.connect(mixOutRef.current, 4)

    // keep alive
    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    mixOutRef.current.connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)

    // Mark node as ready so connection effects can bind existing CV cables
    setNodeReady(true)
  }, moduleId)

  // Update post-VCA per-channel mix levels on slider change
  useEffect(() => {
    const ac = acRef.current,
      node = nodeRef.current
    if (!ac || !node) return
    node.parameters.get('ch0Mix')?.setValueAtTime(chanLevels[0], ac.currentTime)
    node.parameters.get('ch1Mix')?.setValueAtTime(chanLevels[1], ac.currentTime)
    node.parameters.get('ch2Mix')?.setValueAtTime(chanLevels[2], ac.currentTime)
    node.parameters.get('ch3Mix')?.setValueAtTime(chanLevels[3], ac.currentTime)
  }, [chanLevels])

  useEffect(() => {
    const ac = acRef.current,
      node = nodeRef.current
    if (!ac || !node) return
    node.parameters
      .get('mixOffset')
      ?.setValueAtTime(mixLevel[0], ac.currentTime)
    node.parameters.get('mixKnob')?.setValueAtTime(mixLevel[0], ac.currentTime)
  }, [mixLevel])

  // Detect whether Mix CV input is connected and bind/unbind node to input 8 accordingly
  useEffect(() => {
    const node = nodeRef.current
    const mixCv = mixCvRef.current
    if (!node || !mixCv || !nodeReady) return

    const portId = `${moduleId}-mix-cv-in`
    const isConnected = connections.some((e) => e.to === portId)

    if (isConnected && !mixCvConnectedRef.current) {
      try {
        mixCv.connect(node, 0, 8)
      } catch {}
      mixCvConnectedRef.current = true
    } else if (!isConnected && mixCvConnectedRef.current) {
      try {
        mixCv.disconnect(node)
      } catch {}
      mixCvConnectedRef.current = false
    }
  }, [connections, moduleId, nodeReady])

  // Detect channel CV connections and bind/unbind accordingly (inputs 4..7)
  useEffect(() => {
    const node = nodeRef.current
    if (!node || !nodeReady) return
    for (let i = 0; i < 4; i++) {
      const portId = `${moduleId}-ch${i}-cv-in`
      const isConnected = connections.some((e) => e.to === portId)
      if (isConnected && !chCvConnectedRef.current[i]) {
        const cv = chCvRef.current[i]
        if (cv) {
          try {
            cv.connect(node, 0, 4 + i)
          } catch {}
          chCvConnectedRef.current[i] = true
        }
      } else if (!isConnected && chCvConnectedRef.current[i]) {
        const cv = chCvRef.current[i]
        if (cv) {
          try {
            cv.disconnect(node)
          } catch {}
          chCvConnectedRef.current[i] = false
        }
      }
    }
  }, [connections, moduleId, nodeReady])

  useEffect(() => {
    const ac = acRef.current,
      node = nodeRef.current
    if (!ac || !node) return
    node.parameters.get('expo')?.setValueAtTime(expo ? 1 : 0, ac.currentTime)
  }, [expo])

  const sliders = useMemo(
    () =>
      [0, 1, 2, 3].map((i) => (
        <div key={i} className="flex flex-col items-center gap-3">
          <Slider
            orientation="vertical"
            value={[chanLevels[i]]}
            min={0}
            max={1}
            step={0.01}
            size="md"
            onValueChange={(v) =>
              setChanLevels((prev) => {
                const next = [...prev] as [number, number, number, number]
                next[i] = Array.isArray(v) ? v[0] : (v as unknown as number)
                return next
              })
            }
          />
          <TextLabel variant="control" className="text-xs">
            CH{i + 1}
          </TextLabel>
        </div>
      )),
    [chanLevels],
  )

  return (
    <ModuleContainer title="Mixer VCA" moduleId={moduleId}>
      <div className="flex flex-col gap-4 mt-4 flex-1">
        <div className="relative grid grid-cols-4 gap-4 items-end">
          <div className="absolute top-2 left-0 w-full h-[128px] text-neutral-600">
            <div className="z-1 absolute top-[-4px] left-1/2 -translate-x-1/2 text-[9px] leading-[8px] bg-neutral-200 px-1">
              6db
            </div>
            <div className="z-1 absolute top-[calc(25%-4px)] left-1/2 -translate-x-1/2 text-[9px] leading-[8px] bg-neutral-200 px-1">
              0
            </div>
            <div className="z-1 absolute top-[calc(100%-5px)] left-1/2 -translate-x-1/2 text-[12px] leading-[8px] bg-neutral-200 px-1">
              -<span className="text-[16px] opacity-60">∞</span>
            </div>
            <div className="absolute top-[0%] left-0 w-full h-[1px] border-t border-dashed border-neutral-400" />
            <div className="absolute top-[25%] left-0 w-full h-[1px] border-t border-dashed border-neutral-400" />
            <div className="absolute top-[50%] left-0 w-full h-[1px] border-t border-dashed border-neutral-400" />
            <div className="absolute top-[75%] left-0 w-full h-[1px] border-t border-dashed border-neutral-400" />
            <div className="absolute top-[100%] left-0 w-full h-[1px] border-t border-dashed border-neutral-400" />
          </div>
          {sliders}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 w-full">
          <div className="flex justify-between items-end gap-2 w-full">
            <Port
              id={`${moduleId}-mix-cv-in`}
              type="input"
              label="Mix CV"
              audioType="cv"
              audioNode={mixCvRef.current ?? undefined}
            />
            <Knob value={mixLevel} onValueChange={setMixLevel} label="Mix" />
            <Port
              id={`${moduleId}-mix-out`}
              type="output"
              label="MIX"
              audioType="any"
              audioNode={mixOutRef.current ?? undefined}
            />
          </div>

          <ToggleSwitch
            label="Lin"
            topLabel="Exp"
            orientation="horizontal"
            value={expo}
            onValueChange={setExpo}
          />
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={`col-${i}`} className="flex flex-col items-center gap-2">
              <Port
                id={`${moduleId}-ch${i}-cv-in`}
                type="input"
                label={`CV${i + 1}`}
                audioType="cv"
                audioNode={chCvRef.current[i] ?? undefined}
              />
              <Port
                id={`${moduleId}-ch${i}-in`}
                type="input"
                label={`IN${i + 1}`}
                audioType="any"
                audioNode={chInRef.current[i] ?? undefined}
              />
              <Port
                id={`${moduleId}-ch${i}-out`}
                type="output"
                label={`OUT${i + 1}`}
                audioType="any"
                audioNode={chOutRef.current[i] ?? undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </ModuleContainer>
  )
}
