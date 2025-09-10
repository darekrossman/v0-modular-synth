'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConnections } from '@/components/connection-manager'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { TextLabel } from '@/components/text-label'
import { Knob } from '@/components/ui/knob'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { HLine, VLine } from '../marks'

type MeterData = { ch: Float32Array; l: number; r: number }

const map12dB = (v: number) => (v <= 0.75 ? v / 0.75 : 1 + (v - 0.75) * 12)

export function StereoMixerModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager
  const { initialParameters } = useModulePatch(moduleId, () => ({
    chLevel: chLevel.current,
    chPan: chPan.current,
    chSendA: chSendA.current,
    chSendB: chSendB.current,
    chSendAPre: chSendAPre,
    chSendBPre: chSendBPre,
    chMute: chMute,
    retALevel: retALevel.current,
    retBLevel: retBLevel.current,
    mixLLevel: mixLLevel.current,
    mixRLevel: mixRLevel.current,
    mixSat: mixSat.current,
    expo,
    muteAffectsSends,
  }))

  // Persistent state
  const chLevel = useRef<number[]>(
    initialParameters?.chLevel ?? Array.from({ length: 6 }, () => 0.75),
  )
  const chPan = useRef<number[]>(
    initialParameters?.chPan ?? Array.from({ length: 6 }, () => 0),
  )
  const chSendA = useRef<number[]>(
    initialParameters?.chSendA ?? Array.from({ length: 6 }, () => 0),
  )
  const chSendB = useRef<number[]>(
    initialParameters?.chSendB ?? Array.from({ length: 6 }, () => 0),
  )
  const [chSendAPre, setChSendAPre] = useState<boolean[]>(
    initialParameters?.chSendAPre ?? Array.from({ length: 6 }, () => true),
  )
  const [chSendBPre, setChSendBPre] = useState<boolean[]>(
    initialParameters?.chSendBPre ?? Array.from({ length: 6 }, () => true),
  )
  const [chMute, setChMute] = useState<boolean[]>(
    initialParameters?.chMute ?? Array.from({ length: 6 }, () => false),
  )
  const retALevel = useRef<number[]>(initialParameters?.retALevel ?? [0.75])
  const retBLevel = useRef<number[]>(initialParameters?.retBLevel ?? [0.75])
  const mixLLevel = useRef<number[]>(initialParameters?.mixLLevel ?? [0.75])
  const mixRLevel = useRef<number[]>(initialParameters?.mixRLevel ?? [0.75])
  const mixSat = useRef<number[]>(initialParameters?.mixSat ?? [0])
  const [expo, setExpo] = useState(false)
  const [muteAffectsSends, setMuteAffectsSends] = useState(true)

  const meterRAF = useRef<number | null>(null)
  const meterSAB = useRef<Float32Array | null>(null)
  const chMeterRefs = useRef<Array<HTMLDivElement | null>>(
    Array.from({ length: 6 }, () => null),
  )
  const mixMeterLRef = useRef<HTMLDivElement | null>(null)
  const mixMeterRRef = useRef<HTMLDivElement | null>(null)

  const acRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)

  // Inputs
  const chInL = useRef<GainNode[]>([])
  const chInR = useRef<GainNode[]>([])
  const chCvIn = useRef<GainNode[]>([])
  const retAL = useRef<GainNode | null>(null)
  const retAR = useRef<GainNode | null>(null)
  const retBL = useRef<GainNode | null>(null)
  const retBR = useRef<GainNode | null>(null)
  const mixCvIn = useRef<GainNode | null>(null)

  // Outputs
  const sendAL = useRef<GainNode | null>(null)
  const sendAR = useRef<GainNode | null>(null)
  const sendBL = useRef<GainNode | null>(null)
  const sendBR = useRef<GainNode | null>(null)
  const mixOutL = useRef<GainNode | null>(null)
  const mixOutR = useRef<GainNode | null>(null)

  const { connections } = useConnections()
  const chCvConnected = useRef<boolean[]>(
    Array.from({ length: 6 }, () => false),
  )
  const mixCvConnected = useRef(false)
  const [nodeReady, setNodeReady] = useState(false)
  const chInLConnectedRef = useRef<boolean[]>(
    Array.from({ length: 6 }, () => false),
  )
  const chInRConnectedRef = useRef<boolean[]>(
    Array.from({ length: 6 }, () => false),
  )

  useModuleInit(async () => {
    if (nodeRef.current) return
    const ac = getAudioContext()
    acRef.current = ac
    await ac.audioWorklet.addModule('/stereo-mixer-processor.js')

    // Inputs
    chInL.current = Array.from({ length: 6 }, () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    })
    chInR.current = Array.from({ length: 6 }, () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    })
    chCvIn.current = Array.from({ length: 6 }, () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    })
    retAL.current = ac.createGain()
    ;(retAL.current as GainNode).gain.value = 1
    retAR.current = ac.createGain()
    ;(retAR.current as GainNode).gain.value = 1
    retBL.current = ac.createGain()
    ;(retBL.current as GainNode).gain.value = 1
    retBR.current = ac.createGain()
    ;(retBR.current as GainNode).gain.value = 1
    mixCvIn.current = ac.createGain()
    ;(mixCvIn.current as GainNode).gain.value = 1

    // Outputs
    sendAL.current = ac.createGain()
    ;(sendAL.current as GainNode).gain.value = 1
    sendAR.current = ac.createGain()
    ;(sendAR.current as GainNode).gain.value = 1
    sendBL.current = ac.createGain()
    ;(sendBL.current as GainNode).gain.value = 1
    sendBR.current = ac.createGain()
    ;(sendBR.current as GainNode).gain.value = 1
    mixOutL.current = ac.createGain()
    ;(mixOutL.current as GainNode).gain.value = 1
    mixOutR.current = ac.createGain()
    ;(mixOutR.current as GainNode).gain.value = 1

    // Build initial per-channel params so meters/levels match expectations at startup
    const channelParamData: Record<string, number> = {}
    for (let i = 0; i < 6; i++) {
      channelParamData[`ch${i}Level`] = chLevel.current[i] ?? 0.75
      channelParamData[`ch${i}Offset`] = chLevel.current[i] ?? 0.75 // no CV → slider as VCA offset
      channelParamData[`ch${i}Amount`] = 0 // default CV attenuator off
      channelParamData[`ch${i}SendA`] = chSendA.current[i] ?? 0
      channelParamData[`ch${i}SendB`] = chSendB.current[i] ?? 0
      channelParamData[`ch${i}SendAPre`] = chSendAPre[i] ? 1 : 0
      channelParamData[`ch${i}SendBPre`] = chSendBPre[i] ? 1 : 0
      channelParamData[`ch${i}Mute`] = chMute[i] ? 1 : 0
    }

    const node = new AudioWorkletNode(ac, 'stereo-mixer-processor', {
      numberOfInputs: 23,
      numberOfOutputs: 6,
      outputChannelCount: [1, 1, 1, 1, 1, 1],
      parameterData: {
        // defaults aligned to state
        expo: expo ? 1 : 0,
        dcBlock: 1,
        dcCutHz: 5,
        slewMs: 1,
        hardGateDb: -90,
        retALevel: retALevel.current[0],
        retBLevel: retBLevel.current[0],
        mixLLevel: mixLLevel.current[0],
        mixRLevel: mixRLevel.current[0],
        mixOffset: 1,
        mixAmount: 1,
        muteAffectsSends: muteAffectsSends ? 1 : 0,
        mixSat: mixSat.current[0],
        ...channelParamData,
      },
    })
    nodeRef.current = node

    // Audio inputs will be connected conditionally based on actual cables
    // CV, mix CV will be connected conditionally
    ;(retAL.current as GainNode).connect(node, 0, 19)
    ;(retAR.current as GainNode).connect(node, 0, 20)
    ;(retBL.current as GainNode).connect(node, 0, 21)
    ;(retBR.current as GainNode).connect(node, 0, 22)

    // Outputs mapping: 0..5 are mono
    node.connect(sendAL.current as GainNode, 0)
    node.connect(sendAR.current as GainNode, 1)
    node.connect(sendBL.current as GainNode, 2)
    node.connect(sendBR.current as GainNode, 3)
    node.connect(mixOutL.current as GainNode, 4)
    node.connect(mixOutR.current as GainNode, 5)

    // Keep alive
    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    ;(mixOutL.current as GainNode).connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)

    // Setup SAB metering buffer
    try {
      const sab = new SharedArrayBuffer(8 * 4)
      meterSAB.current = new Float32Array(sab)
      node.port.postMessage({ type: 'initMeters', sab })
    } catch {}

    // UI meter read loop (single rAF)
    const meterLoop = () => {
      const arr = meterSAB.current
      if (arr && arr.length >= 8) {
        // Update DOM directly (no React state) for performance
        const refs = chMeterRefs.current
        for (let i = 0; i < 6; i++) {
          const el = refs[i]
          if (el) el.style.height = `${Math.min(100, (arr[i] || 0) * 120)}%`
        }
        if (mixMeterLRef.current)
          mixMeterLRef.current.style.height = `${Math.min(100, (arr[6] || 0) * 120)}%`
        if (mixMeterRRef.current)
          mixMeterRRef.current.style.height = `${Math.min(100, (arr[7] || 0) * 120)}%`
      }
      meterRAF.current = requestAnimationFrame(meterLoop)
    }
    meterRAF.current = requestAnimationFrame(meterLoop)

    setNodeReady(true)
  }, moduleId)

  useEffect(() => {
    return () => {
      if (meterRAF.current) cancelAnimationFrame(meterRAF.current)
      meterRAF.current = null
      meterSAB.current = null
    }
  }, [])

  // Connect/disconnect CV based on cables, and flip offset/amount semantics
  const { current: cvConn } = chCvConnected
  useEffect(() => {
    console.log('cv connect/disconnect')
    if (!nodeRef.current) return
    const node = nodeRef.current
    const ac = acRef.current as AudioContext
    for (let i = 0; i < 6; i++) {
      const portId = `${moduleId}-ch${i + 1}-cv-in`
      const isConn = connections.some((e) => e.to === portId)
      if (isConn && !cvConn[i]) {
        chCvIn.current[i].connect(node, 0, 12 + i)
        cvConn[i] = true
        // switch: slider becomes CV amount, offset to 0
        node.parameters
          .get(`ch${i}Amount`)
          ?.setValueAtTime(chLevel.current[i], ac.currentTime)
        node.parameters.get(`ch${i}Offset`)?.setValueAtTime(0, ac.currentTime)
      } else if (!isConn && cvConn[i]) {
        try {
          chCvIn.current[i].disconnect(node)
        } catch {}
        cvConn[i] = false
        // switch: slider becomes offset, amount to 0
        node.parameters
          .get(`ch${i}Offset`)
          ?.setValueAtTime(chLevel.current[i], ac.currentTime)
        node.parameters.get(`ch${i}Amount`)?.setValueAtTime(0, ac.currentTime)
      }
    }
  }, [connections, moduleId, nodeReady, chLevel])

  useEffect(() => {
    console.log('static param updates')
    if (!nodeRef.current) return
    const ac = acRef.current as AudioContext
    const node = nodeRef.current
    // static params
    node.parameters.get('expo')?.setValueAtTime(expo ? 1 : 0, ac.currentTime)
    node.parameters
      .get('muteAffectsSends')
      ?.setValueAtTime(muteAffectsSends ? 1 : 0, ac.currentTime)
    node.parameters
      .get('retALevel')
      ?.setValueAtTime(retALevel.current[0], ac.currentTime)
    node.parameters
      .get('retBLevel')
      ?.setValueAtTime(retBLevel.current[0], ac.currentTime)
    node.parameters
      .get('mixLLevel')
      ?.setValueAtTime(mixLLevel.current[0], ac.currentTime)
    node.parameters
      .get('mixRLevel')
      ?.setValueAtTime(mixRLevel.current[0], ac.currentTime)
    node.parameters
      .get('mixSat')
      ?.setValueAtTime(mixSat.current[0], ac.currentTime)
  }, [
    expo,
    muteAffectsSends,
    retALevel,
    retBLevel,
    mixLLevel,
    mixRLevel,
    mixSat,
  ])

  // Update per-channel params when knobs/sliders change
  useEffect(() => {
    console.log('param updates')
    if (!nodeRef.current) return
    const ac = acRef.current as AudioContext
    const node = nodeRef.current
    for (let i = 0; i < 6; i++) {
      node.parameters
        .get(`ch${i}Level`)
        ?.setValueAtTime(chLevel.current[i], ac.currentTime)
      node.parameters
        .get(`ch${i}Pan`)
        ?.setValueAtTime(chPan.current[i], ac.currentTime)
      node.parameters
        .get(`ch${i}SendA`)
        ?.setValueAtTime(chSendA.current[i], ac.currentTime)
      node.parameters
        .get(`ch${i}SendB`)
        ?.setValueAtTime(chSendB.current[i], ac.currentTime)
      node.parameters
        .get(`ch${i}SendAPre`)
        ?.setValueAtTime(chSendAPre[i] ? 1 : 0, ac.currentTime)
      node.parameters
        .get(`ch${i}SendBPre`)
        ?.setValueAtTime(chSendBPre[i] ? 1 : 0, ac.currentTime)
      node.parameters
        .get(`ch${i}Mute`)
        ?.setValueAtTime(chMute[i] ? 1 : 0, ac.currentTime)
      // Offset/Amount values depend on CV connection (handled in connection effect and on slider change)
    }
  }, [chLevel, chPan, chSendA, chSendB, chSendAPre, chSendBPre, chMute])

  // Mix CV connect/disconnect
  useEffect(() => {
    console.log('mix cv connect/disconnect')
    if (!nodeRef.current || !mixCvIn.current) return
    const node = nodeRef.current
    const isConn = connections.some((e) => e.to === `${moduleId}-mix-cv-in`)
    if (isConn && !mixCvConnected.current) {
      mixCvIn.current.connect(node, 0, 18)
      mixCvConnected.current = true
    } else if (!isConn && mixCvConnected.current) {
      try {
        mixCvIn.current.disconnect(node)
      } catch {}
      mixCvConnected.current = false
    }
  }, [connections, moduleId, nodeReady])

  // Channel audio L/R connect/disconnect based on cables
  useEffect(() => {
    console.log('channel audio connect/disconnect')
    const node = nodeRef.current
    if (!node || !nodeReady) return
    for (let i = 0; i < 6; i++) {
      const lId = `${moduleId}-ch${i + 1}-l-in`
      const rId = `${moduleId}-ch${i + 1}-r-in`
      const hasL = connections.some((e) => e.to === lId)
      const hasR = connections.some((e) => e.to === rId)

      if (hasL && !chInLConnectedRef.current[i]) {
        chInL.current[i]?.connect(node, 0, i * 2)
        chInLConnectedRef.current[i] = true
      } else if (!hasL && chInLConnectedRef.current[i]) {
        try {
          chInL.current[i]?.disconnect(node)
        } catch {}
        chInLConnectedRef.current[i] = false
      }

      if (hasR && !chInRConnectedRef.current[i]) {
        chInR.current[i]?.connect(node, 0, i * 2 + 1)
        chInRConnectedRef.current[i] = true
      } else if (!hasR && chInRConnectedRef.current[i]) {
        try {
          chInR.current[i]?.disconnect(node)
        } catch {}
        chInRConnectedRef.current[i] = false
      }
    }
  }, [connections, moduleId, nodeReady])

  // Channel level slider change handler: flips offset/amount based on CV connection
  const onLevelChange = useCallback((idx: number, v: number[]) => {
    console.log('onLevelChange', idx, v)
    const prev = chLevel.current
    const next = prev.slice()
    next[idx] = v[0]
    chLevel.current = next

    const node = nodeRef.current
    const ac = acRef.current
    if (node && ac) {
      if (chCvConnected.current[idx]) {
        node.parameters
          .get(`ch${idx}Amount`)
          ?.setValueAtTime(v[0], ac.currentTime)
      } else {
        node.parameters
          .get(`ch${idx}Offset`)
          ?.setValueAtTime(v[0], ac.currentTime)
      }
    }
  }, [])

  console.log('mixer')

  return (
    <ModuleContainer title="Stereo Mixer" moduleId={moduleId}>
      <div className="flex gap-4 flex-1">
        {/* Channels */}
        <div className="grid grid-cols-6 gap-4 items-start">
          {Array.from({ length: 6 }, (_, i) => {
            return (
              <div key={`ch-${i}`} className="flex flex-col items-center gap-2">
                <Slider
                  orientation="vertical"
                  size="sm"
                  defaultValue={[chLevel.current[i]]}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={(v) => onLevelChange(i, v as number[])}
                />
                <TextLabel variant="control" className="text-[10px] mb-2">
                  CH{i + 1}
                </TextLabel>
                <VLine />
                <Port
                  id={`${moduleId}-ch${i + 1}-cv-in`}
                  type="input"
                  audioType="cv"
                  audioNode={chCvIn.current[i] ?? undefined}
                />

                <div className="flex gap-2">
                  <Knob
                    value={[(chPan.current[i] + 1) / 2]}
                    onValueChange={(v) => {
                      const n = chPan.current.slice()
                      n[i] = v[0] * 2 - 1 // map 0..1 knob to -1..1 pan
                      chPan.current = n
                    }}
                    size="xs"
                    label="Pan"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <Knob
                      defaultValue={chSendA.current}
                      onValueChange={(v) => {
                        const n = chSendA.current.slice()
                        n[i] = v[0]
                        chSendA.current = n
                      }}
                      size="xs"
                      label="A"
                    />
                    <Toggle
                      size="xs"
                      pressed={chSendAPre[i]}
                      onPressedChange={(t) => {
                        const n = chSendAPre.slice()
                        n[i] = !!t
                        setChSendAPre(n)
                      }}
                      className="px-1 py-0.5 text-[10px]"
                    >
                      Pre
                    </Toggle>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Knob
                      defaultValue={chSendB.current}
                      onValueChange={(v) => {
                        const n = chSendB.current.slice()
                        n[i] = v[0]
                        chSendB.current = n
                      }}
                      size="xs"
                      label="B"
                    />
                    <Toggle
                      size="xs"
                      pressed={chSendBPre[i]}
                      onPressedChange={(t) => {
                        const n = chSendBPre.slice()
                        n[i] = !!t
                        setChSendBPre(n)
                      }}
                      className="px-1 py-0.5 text-[10px]"
                    >
                      Pre
                    </Toggle>
                  </div>
                </div>
                <Toggle
                  size="xs"
                  pressed={chMute[i]}
                  onPressedChange={(t) => {
                    const n = chMute.slice()
                    n[i] = !!t
                    setChMute(n)
                  }}
                  className="px-2 py-0.5 text-[10px]"
                >
                  Mute
                </Toggle>
                {/* Ports */}
                <div className="flex items-center mt-2">
                  <Port
                    id={`${moduleId}-ch${i + 1}-l-in`}
                    type="input"
                    label="L"
                    audioType="audio"
                    audioNode={chInL.current[i] ?? undefined}
                  />
                  <Port
                    id={`${moduleId}-ch${i + 1}-r-in`}
                    type="input"
                    label="R"
                    audioType="audio"
                    audioNode={chInR.current[i] ?? undefined}
                  />
                </div>
                {/* Tiny meter */}
                <div className="relative w-4 h-16 bg-black/80 rounded-xs overflow-hidden">
                  <div
                    ref={(el) => {
                      chMeterRefs.current[i] = el
                    }}
                    className="absolute left-0 right-0 bottom-0 bg-green-500"
                    style={{ height: '0%' }}
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {/* Returns */}
          <div className="flex flex-col items-center gap-2">
            <TextLabel>Returns</TextLabel>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2">
                <Knob
                  defaultValue={retALevel.current}
                  onValueChange={(v) => {
                    retALevel.current = v
                  }}
                  label="A"
                  size="sm"
                />
                <div className="flex items-center gap-1">
                  <Port
                    id={`${moduleId}-retA-l-in`}
                    type="input"
                    label="L"
                    audioType="audio"
                    audioNode={retAL.current ?? undefined}
                  />
                  <Port
                    id={`${moduleId}-retA-r-in`}
                    type="input"
                    label="R"
                    audioType="audio"
                    audioNode={retAR.current ?? undefined}
                  />
                </div>
                <PortGroup>
                  <Port
                    id={`${moduleId}-sendA-l-out`}
                    type="output"
                    label="A L"
                    audioType="audio"
                    audioNode={sendAL.current ?? undefined}
                  />
                  <Port
                    id={`${moduleId}-sendA-r-out`}
                    type="output"
                    label="A R"
                    audioType="audio"
                    audioNode={sendAR.current ?? undefined}
                  />
                </PortGroup>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Knob
                  defaultValue={retBLevel.current}
                  onValueChange={(v) => {
                    retBLevel.current = v
                  }}
                  label="B"
                  size="sm"
                />
                <div className="flex items-center">
                  <Port
                    id={`${moduleId}-retB-l-in`}
                    type="input"
                    label="L"
                    audioType="audio"
                    audioNode={retBL.current ?? undefined}
                  />
                  <Port
                    id={`${moduleId}-retB-r-in`}
                    type="input"
                    label="R"
                    audioType="audio"
                    audioNode={retBR.current ?? undefined}
                  />
                </div>

                <PortGroup>
                  <Port
                    id={`$moduleId-sendB-l-out`}
                    type="output"
                    label="B L"
                    audioType="audio"
                    audioNode={sendBL.current ?? undefined}
                  />
                  <Port
                    id={`$moduleId-sendB-r-out`}
                    type="output"
                    label="B R"
                    audioType="audio"
                    audioNode={sendBR.current ?? undefined}
                  />
                </PortGroup>
              </div>
            </div>
          </div>

          {/* Master */}
          <div className="flex flex-col items-center gap-2">
            <TextLabel>Master</TextLabel>
            <div className="flex items-end gap-4">
              <Slider
                orientation="vertical"
                size="md"
                defaultValue={mixLLevel.current}
                onValueChange={(v) => {
                  mixLLevel.current = v
                }}
                min={0}
                max={1}
                step={0.01}
              />
              <Slider
                orientation="vertical"
                size="md"
                defaultValue={mixRLevel.current}
                onValueChange={(v) => {
                  mixRLevel.current = v
                }}
                min={0}
                max={1}
                step={0.01}
              />
              <div className="flex flex-col items-center gap-2 ml-2">
                <Port
                  id={`$moduleId-mix-cv-in`}
                  type="input"
                  label="Mix CV"
                  audioType="cv"
                  audioNode={mixCvIn.current ?? undefined}
                />
                <ToggleSwitch
                  label="Lin"
                  topLabel="Exp"
                  orientation="horizontal"
                  value={expo}
                  onValueChange={setExpo}
                />
                <Toggle
                  pressed={muteAffectsSends}
                  onPressedChange={(t) => setMuteAffectsSends(!!t)}
                  className="px-2 py-0.5 text-[10px]"
                >
                  Mute→Sends
                </Toggle>
                <Knob
                  defaultValue={mixSat.current}
                  onValueChange={(v) => {
                    mixSat.current = v
                  }}
                  size="xs"
                  label="Clip"
                />
              </div>
            </div>
            {/* Master tiny meters */}
            <div className="flex gap-2 mt-2">
              <div className="relative w-4 h-16 bg-black/80 rounded-xs overflow-hidden">
                <div
                  ref={mixMeterLRef}
                  className="absolute left-0 right-0 bottom-0 bg-green-500"
                  style={{ height: '0%' }}
                />
              </div>
              <div className="relative w-4 h-16 bg-black/80 rounded-xs overflow-hidden">
                <div
                  ref={mixMeterRRef}
                  className="absolute left-0 right-0 bottom-0 bg-green-500"
                  style={{ height: '0%' }}
                />
              </div>
            </div>

            <PortGroup>
              <Port
                id={`$moduleId-mix-l-out`}
                type="output"
                label="L"
                audioType="audio"
                audioNode={mixOutL.current ?? undefined}
              />
              <Port
                id={`$moduleId-mix-r-out`}
                type="output"
                label="R"
                audioType="audio"
                audioNode={mixOutR.current ?? undefined}
              />
            </PortGroup>
          </div>
        </div>
      </div>
    </ModuleContainer>
  )
}
