'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Button } from '@/components/ui/button'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { mapLinear } from '@/lib/utils'
import { useConnections } from '../connection-manager'
import { VLine } from '../marks'
import { Toggle } from '../ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'

// Mappings
const SIZE_MIN = 0.3,
  SIZE_MAX = 2.0
const DAMP_MIN = 500,
  DAMP_MAX = 12000
const PRE_MIN = 0.0,
  PRE_MAX = 0.25
const LOWCUT_MIN = 20,
  LOWCUT_MAX = 300
const HIGHCUT_MIN = 2000,
  HIGHCUT_MAX = 16000
const MODRATE_MIN = 0.05,
  MODRATE_MAX = 3.0
const DUCKREL_MIN = 20,
  DUCKREL_MAX = 1000

type Algo = 0 | 1 | 2 // 0=Room, 1=Hall, 2=Plate
type Quality = 0 | 1 | 2 // 0=Eco,1=Normal,2=HQ

export function ReverbModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    size: sizeN[0],
    decay: decayN[0],
    dampHz: mapLinear(dampN[0], DAMP_MIN, DAMP_MAX),
    preDelay: mapLinear(preN[0], PRE_MIN, PRE_MAX),
    mix: mixN[0],
    algo,
    width: widthN[0],
    lowCutHz: mapLinear(lowCutN[0], LOWCUT_MIN, LOWCUT_MAX),
    highCutHz: mapLinear(highCutN[0], HIGHCUT_MIN, HIGHCUT_MAX),
    diffusion: diffusionN[0],
    modRateHz: mapLinear(modRateN[0], MODRATE_MIN, MODRATE_MAX),
    modDepth: modDepthN[0],
    erLevel: erLevelN[0],
    erTime: erTimeN[0],
    quality,
    duckAmount: duckAmountN[0],
    duckReleaseMs: mapLinear(duckReleaseN[0], DUCKREL_MIN, DUCKREL_MAX),
    freeze: freezeOn ? 1 : 0,
    sizeCvAmt: sizeCvAmtN[0],
    dampCvAmt: dampCvAmtN[0],
    decayCvAmt: decayCvAmtN[0],
    mixCvAmt: mixCvAmtN[0],
    widthCvAmt: widthCvAmtN[0],
    lowCutCvAmt: lowCutCvAmtN[0],
    highCutCvAmt: highCutCvAmtN[0],
    modDepthCvAmt: modDepthCvAmtN[0],
    modRateCvAmt: modRateCvAmtN[0],
    duckCvAmt: duckCvAmtN[0],
  }))

  // Normalized UI state (0..1)
  const [sizeN, setSizeN] = useState([initialParameters?.size ?? 0.6])
  const [decayN, setDecayN] = useState([initialParameters?.decay ?? 0.7])
  const [dampN, setDampN] = useState([
    initialParameters?.dampHz !== undefined
      ? (initialParameters.dampHz - DAMP_MIN) / (DAMP_MAX - DAMP_MIN)
      : 0.6,
  ])
  const [preN, setPreN] = useState([
    initialParameters?.preDelay !== undefined
      ? (initialParameters.preDelay - PRE_MIN) / (PRE_MAX - PRE_MIN)
      : 0.08 / (PRE_MAX - PRE_MIN),
  ])
  const [mixN, setMixN] = useState([initialParameters?.mix ?? 0.35])

  const [widthN, setWidthN] = useState([initialParameters?.width ?? 0.75])
  const [lowCutN, setLowCutN] = useState([
    initialParameters?.lowCutHz !== undefined
      ? (initialParameters.lowCutHz - LOWCUT_MIN) / (LOWCUT_MAX - LOWCUT_MIN)
      : (80 - LOWCUT_MIN) / (LOWCUT_MAX - LOWCUT_MIN),
  ])
  const [highCutN, setHighCutN] = useState([
    initialParameters?.highCutHz !== undefined
      ? (initialParameters.highCutHz - HIGHCUT_MIN) /
        (HIGHCUT_MAX - HIGHCUT_MIN)
      : (12000 - HIGHCUT_MIN) / (HIGHCUT_MAX - HIGHCUT_MIN),
  ])
  const [diffusionN, setDiffusionN] = useState([
    initialParameters?.diffusion ?? 0.6,
  ])
  const [modRateN, setModRateN] = useState([
    initialParameters?.modRateHz !== undefined
      ? (initialParameters.modRateHz - MODRATE_MIN) /
        (MODRATE_MAX - MODRATE_MIN)
      : (0.2 - MODRATE_MIN) / (MODRATE_MAX - MODRATE_MIN),
  ])
  const [modDepthN, setModDepthN] = useState([
    initialParameters?.modDepth ?? 0.1,
  ])
  const [erLevelN, setErLevelN] = useState([initialParameters?.erLevel ?? 0.2])
  const [erTimeN, setErTimeN] = useState([initialParameters?.erTime ?? 0.35])
  const [duckAmountN, setDuckAmountN] = useState([
    initialParameters?.duckAmount ?? 0.0,
  ])
  const [duckReleaseN, setDuckReleaseN] = useState([
    initialParameters?.duckReleaseMs !== undefined
      ? (initialParameters.duckReleaseMs - DUCKREL_MIN) /
        (DUCKREL_MAX - DUCKREL_MIN)
      : (250 - DUCKREL_MIN) / (DUCKREL_MAX - DUCKREL_MIN),
  ])

  const [freezeOn, setFreezeOn] = useState(Boolean(initialParameters?.freeze))

  // CV depths (0..1)
  const [sizeCvAmtN, setSizeCvAmtN] = useState([
    initialParameters?.sizeCvAmt ?? 1,
  ])
  const [dampCvAmtN, setDampCvAmtN] = useState([
    initialParameters?.dampCvAmt ?? 1,
  ])
  const [decayCvAmtN, setDecayCvAmtN] = useState([
    initialParameters?.decayCvAmt ?? 1,
  ])
  const [mixCvAmtN, setMixCvAmtN] = useState([initialParameters?.mixCvAmt ?? 1])

  const [widthCvAmtN, setWidthCvAmtN] = useState([
    initialParameters?.widthCvAmt ?? 1,
  ])
  const [lowCutCvAmtN, setLowCutCvAmtN] = useState([
    initialParameters?.lowCutCvAmt ?? 0.5,
  ])
  const [highCutCvAmtN, setHighCutCvAmtN] = useState([
    initialParameters?.highCutCvAmt ?? 0.5,
  ])
  const [modDepthCvAmtN, setModDepthCvAmtN] = useState([
    initialParameters?.modDepthCvAmt ?? 0.5,
  ])
  const [modRateCvAmtN, setModRateCvAmtN] = useState([
    initialParameters?.modRateCvAmt ?? 0.5,
  ])
  const [duckCvAmtN, setDuckCvAmtN] = useState([
    initialParameters?.duckCvAmt ?? 1,
  ])

  const [algo, setAlgo] = useState<Algo>(initialParameters?.algo ?? 1)
  const [quality, setQuality] = useState<Quality>(
    initialParameters?.quality ?? 1,
  )

  // Graph
  const acRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)

  // Audio I/O nodes
  const inLRef = useRef<GainNode | null>(null)
  const inRRef = useRef<GainNode | null>(null)
  const outLRef = useRef<GainNode | null>(null)
  const outRRef = useRef<GainNode | null>(null)
  const sidechainInRef = useRef<GainNode | null>(null)

  // CV inputs
  const sizeCvInRef = useRef<GainNode | null>(null)
  const dampCvInRef = useRef<GainNode | null>(null)
  const decayCvInRef = useRef<GainNode | null>(null)
  const mixCvInRef = useRef<GainNode | null>(null)
  const widthCvInRef = useRef<GainNode | null>(null)
  const lowCutCvInRef = useRef<GainNode | null>(null)
  const highCutCvInRef = useRef<GainNode | null>(null)
  const modDepthCvInRef = useRef<GainNode | null>(null)
  const modRateCvInRef = useRef<GainNode | null>(null)
  const duckCvInRef = useRef<GainNode | null>(null)
  const freezeCvInRef = useRef<GainNode | null>(null)

  const mergerRef = useRef<ChannelMergerNode | null>(null)
  const splitterRef = useRef<ChannelSplitterNode | null>(null)

  const { connections } = useConnections()

  const setParam = (name: string, v: number, tSmooth = 0.02) => {
    const ac = acRef.current,
      w = workletRef.current
    if (!ac || !w) return
    const p = w.parameters.get(name)
    if (!p) return
    p.setTargetAtTime(v, ac.currentTime, tSmooth)
  }

  const init = useCallback(async () => {
    if (workletRef.current) return // Already initialized

    const ac = getAudioContext()
    acRef.current = ac
    await ac.audioWorklet.addModule('/reverb-processor.js')

    // I/O
    inLRef.current = ac.createGain()
    inLRef.current.gain.value = 1
    inRRef.current = ac.createGain()
    inRRef.current.gain.value = 1
    outLRef.current = ac.createGain()
    outLRef.current.gain.value = 1
    outRRef.current = ac.createGain()
    outRRef.current.gain.value = 1

    // Sidechain input
    sidechainInRef.current = ac.createGain()
    sidechainInRef.current.gain.value = 1

    // CV inputs
    sizeCvInRef.current = ac.createGain()
    sizeCvInRef.current.gain.value = 1
    dampCvInRef.current = ac.createGain()
    dampCvInRef.current.gain.value = 1
    decayCvInRef.current = ac.createGain()
    decayCvInRef.current.gain.value = 1
    mixCvInRef.current = ac.createGain()
    mixCvInRef.current.gain.value = 1
    widthCvInRef.current = ac.createGain()
    widthCvInRef.current.gain.value = 1
    lowCutCvInRef.current = ac.createGain()
    lowCutCvInRef.current.gain.value = 1
    highCutCvInRef.current = ac.createGain()
    highCutCvInRef.current.gain.value = 1
    modDepthCvInRef.current = ac.createGain()
    modDepthCvInRef.current.gain.value = 1
    modRateCvInRef.current = ac.createGain()
    modRateCvInRef.current.gain.value = 1
    duckCvInRef.current = ac.createGain()
    duckCvInRef.current.gain.value = 1
    freezeCvInRef.current = ac.createGain()
    freezeCvInRef.current.gain.value = 1

    // Merge L/R → stereo input 0
    const merger = ac.createChannelMerger(2)
    mergerRef.current = merger
    inLRef.current.connect(merger, 0, 0)
    inRRef.current.connect(merger, 0, 1)

    // Worklet: 13 inputs (stereo audio, size,damp,decay,mix,width,lowCut,highCut,modDepth,modRate,duck,freeze,sidechain), 1 stereo output
    const w = new AudioWorkletNode(ac, 'reverb-processor', {
      numberOfInputs: 13,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    })
    workletRef.current = w

    // Wire inputs
    merger.connect(w, 0, 0)
    sizeCvInRef.current.connect(w, 0, 1)
    dampCvInRef.current.connect(w, 0, 2)
    decayCvInRef.current.connect(w, 0, 3)
    mixCvInRef.current.connect(w, 0, 4)
    widthCvInRef.current.connect(w, 0, 5)
    lowCutCvInRef.current.connect(w, 0, 6)
    highCutCvInRef.current.connect(w, 0, 7)
    modDepthCvInRef.current.connect(w, 0, 8)
    modRateCvInRef.current.connect(w, 0, 9)
    duckCvInRef.current.connect(w, 0, 10)
    freezeCvInRef.current.connect(w, 0, 11)
    sidechainInRef.current.connect(w, 0, 12)

    // Split stereo output → two mono port nodes
    const splitter = ac.createChannelSplitter(2)
    splitterRef.current = splitter
    w.connect(splitter)
    splitter.connect(outLRef.current, 0)
    splitter.connect(outRRef.current, 1)

    // Initial params
    setParam('size', Math.max(0, Math.min(1, sizeN[0])), 0.02)
    setParam('decay', Math.max(0, Math.min(1, decayN[0])), 0.02)
    setParam('dampHz', mapLinear(dampN[0], DAMP_MIN, DAMP_MAX), 0.02)
    setParam('preDelay', mapLinear(preN[0], PRE_MIN, PRE_MAX), 0.02)
    setParam('mix', Math.max(0, Math.min(1, mixN[0])), 0.02)
    setParam('type', algo, 0.0)
    setParam('width', Math.max(0, Math.min(1, widthN[0])), 0.02)
    setParam('lowCutHz', mapLinear(lowCutN[0], LOWCUT_MIN, LOWCUT_MAX), 0.02)
    setParam(
      'highCutHz',
      mapLinear(highCutN[0], HIGHCUT_MIN, HIGHCUT_MAX),
      0.02,
    )
    setParam('diffusion', Math.max(0, Math.min(1, diffusionN[0])), 0.02)
    setParam(
      'modRateHz',
      mapLinear(modRateN[0], MODRATE_MIN, MODRATE_MAX),
      0.02,
    )
    setParam('modDepth', Math.max(0, Math.min(1, modDepthN[0])), 0.02)
    setParam('erLevel', Math.max(0, Math.min(1, erLevelN[0])), 0.02)
    setParam('erTime', Math.max(0, Math.min(1, erTimeN[0])), 0.02)
    setParam('quality', quality, 0.0)
    setParam('duckAmount', Math.max(0, Math.min(1, duckAmountN[0])), 0.02)
    setParam(
      'duckReleaseMs',
      mapLinear(duckReleaseN[0], DUCKREL_MIN, DUCKREL_MAX),
      0.02,
    )
    setParam('freeze', freezeOn ? 1 : 0, 0.0)
    setParam('sizeCvAmt', Math.max(0, Math.min(1, sizeCvAmtN[0])), 0.02)
    setParam('dampCvAmt', Math.max(0, Math.min(1, dampCvAmtN[0])), 0.02)
    setParam('decayCvAmt', Math.max(0, Math.min(1, decayCvAmtN[0])), 0.02)
    setParam('mixCvAmt', Math.max(0, Math.min(1, mixCvAmtN[0])), 0.02)
    setParam('widthCvAmt', Math.max(0, Math.min(1, widthCvAmtN[0])), 0.02)
    setParam('lowCutCvAmt', Math.max(0, Math.min(1, lowCutCvAmtN[0])), 0.02)
    setParam('highCutCvAmt', Math.max(0, Math.min(1, highCutCvAmtN[0])), 0.02)
    setParam('modDepthCvAmt', Math.max(0, Math.min(1, modDepthCvAmtN[0])), 0.02)
    setParam('modRateCvAmt', Math.max(0, Math.min(1, modRateCvAmtN[0])), 0.02)
    setParam('duckCvAmt', Math.max(0, Math.min(1, duckCvAmtN[0])), 0.02)

    // dryMono based on connections
    const inLId = `${moduleId}-in-l`
    const inRId = `${moduleId}-in-r`
    const hasL = connections.some((e) => e.to === inLId)
    const hasR = connections.some((e) => e.to === inRId)
    setParam('dryMono', hasL !== hasR ? 1 : 0, 0.0)

    // eslint-disable-next-line no-console
    console.log('[REVERB] initialized')
  }, [
    connections,
    moduleId,
    sizeN,
    decayN,
    dampN,
    preN,
    mixN,
    algo,
    widthN,
    lowCutN,
    highCutN,
    diffusionN,
    modRateN,
    modDepthN,
    erLevelN,
    erTimeN,
    quality,
    duckAmountN,
    duckReleaseN,
    freezeOn,
    sizeCvAmtN,
    dampCvAmtN,
    decayCvAmtN,
    mixCvAmtN,
    widthCvAmtN,
    lowCutCvAmtN,
    highCutCvAmtN,
    modDepthCvAmtN,
    modRateCvAmtN,
    duckCvAmtN,
  ])

  // Use the module initialization hook
  const { isReady, initError, retryInit } = useModuleInit(init, 'REVERB')

  // Push updates
  useEffect(() => {
    setParam('size', Math.max(0, Math.min(1, sizeN[0])))
  }, [sizeN])
  useEffect(() => {
    setParam('decay', Math.max(0, Math.min(1, decayN[0])))
  }, [decayN])
  useEffect(() => {
    setParam('dampHz', mapLinear(dampN[0], DAMP_MIN, DAMP_MAX))
  }, [dampN])
  useEffect(() => {
    setParam('preDelay', mapLinear(preN[0], PRE_MIN, PRE_MAX))
  }, [preN])
  useEffect(() => {
    setParam('mix', Math.max(0, Math.min(1, mixN[0])))
  }, [mixN])
  useEffect(() => {
    setParam('type', algo, 0.0)
  }, [algo])
  useEffect(() => {
    setParam('width', Math.max(0, Math.min(1, widthN[0])))
  }, [widthN])
  useEffect(() => {
    setParam('lowCutHz', mapLinear(lowCutN[0], LOWCUT_MIN, LOWCUT_MAX))
  }, [lowCutN])
  useEffect(() => {
    setParam('highCutHz', mapLinear(highCutN[0], HIGHCUT_MIN, HIGHCUT_MAX))
  }, [highCutN])
  useEffect(() => {
    setParam('diffusion', Math.max(0, Math.min(1, diffusionN[0])))
  }, [diffusionN])
  useEffect(() => {
    setParam('modRateHz', mapLinear(modRateN[0], MODRATE_MIN, MODRATE_MAX))
  }, [modRateN])
  useEffect(() => {
    setParam('modDepth', Math.max(0, Math.min(1, modDepthN[0])))
  }, [modDepthN])
  useEffect(() => {
    setParam('erLevel', Math.max(0, Math.min(1, erLevelN[0])))
  }, [erLevelN])
  useEffect(() => {
    setParam('erTime', Math.max(0, Math.min(1, erTimeN[0])))
  }, [erTimeN])
  useEffect(() => {
    setParam('quality', quality, 0.0)
  }, [quality])
  useEffect(() => {
    setParam('duckAmount', Math.max(0, Math.min(1, duckAmountN[0])))
  }, [duckAmountN])
  useEffect(() => {
    setParam(
      'duckReleaseMs',
      mapLinear(duckReleaseN[0], DUCKREL_MIN, DUCKREL_MAX),
    )
  }, [duckReleaseN])
  useEffect(() => {
    setParam('freeze', freezeOn ? 1 : 0, 0.0)
  }, [freezeOn])

  useEffect(() => {
    setParam('sizeCvAmt', Math.max(0, Math.min(1, sizeCvAmtN[0])))
  }, [sizeCvAmtN])
  useEffect(() => {
    setParam('dampCvAmt', Math.max(0, Math.min(1, dampCvAmtN[0])))
  }, [dampCvAmtN])
  useEffect(() => {
    setParam('decayCvAmt', Math.max(0, Math.min(1, decayCvAmtN[0])))
  }, [decayCvAmtN])
  useEffect(() => {
    setParam('mixCvAmt', Math.max(0, Math.min(1, mixCvAmtN[0])))
  }, [mixCvAmtN])
  useEffect(() => {
    setParam('widthCvAmt', Math.max(0, Math.min(1, widthCvAmtN[0])))
  }, [widthCvAmtN])
  useEffect(() => {
    setParam('lowCutCvAmt', Math.max(0, Math.min(1, lowCutCvAmtN[0])))
  }, [lowCutCvAmtN])
  useEffect(() => {
    setParam('highCutCvAmt', Math.max(0, Math.min(1, highCutCvAmtN[0])))
  }, [highCutCvAmtN])
  useEffect(() => {
    setParam('modDepthCvAmt', Math.max(0, Math.min(1, modDepthCvAmtN[0])))
  }, [modDepthCvAmtN])
  useEffect(() => {
    setParam('modRateCvAmt', Math.max(0, Math.min(1, modRateCvAmtN[0])))
  }, [modRateCvAmtN])
  useEffect(() => {
    setParam('duckCvAmt', Math.max(0, Math.min(1, duckCvAmtN[0])))
  }, [duckCvAmtN])

  // dry mono whenever connection changes
  useEffect(() => {
    const inLId = `${moduleId}-in-l`
    const inRId = `${moduleId}-in-r`
    const hasL = connections.some((e) => e.to === inLId)
    const hasR = connections.some((e) => e.to === inRId)
    setParam('dryMono', hasL !== hasR ? 1 : 0, 0.0)
  }, [connections, moduleId])

  return (
    <ModuleContainer title="Reverb" moduleId={moduleId}>
      {/* Algo selector */}
      <ToggleGroup
        type="single"
        size="md"
        value={algo.toString()}
        onValueChange={(v) => setAlgo(parseInt(v, 10) as Algo)}
      >
        {[
          { a: 0 as Algo, label: 'Room' },
          { a: 1 as Algo, label: 'Hall' },
          { a: 2 as Algo, label: 'Plate' },
        ].map(({ a, label }) => (
          <ToggleGroupItem key={a} value={a.toString()}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {/* Quality selector */}
      <div className="mt-3">
        <ToggleGroup
          type="single"
          size="sm"
          value={quality.toString()}
          onValueChange={(v) => setQuality(parseInt(v, 10) as Quality)}
        >
          {[
            { q: 0 as Quality, label: 'Eco' },
            { q: 1 as Quality, label: 'Normal' },
            { q: 2 as Quality, label: 'HQ' },
          ].map(({ q, label }) => (
            <ToggleGroupItem key={q} value={q.toString()}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-col items-center gap-6 mt-5">
        <div className="flex items-center gap-6">
          <Knob value={sizeN} onValueChange={setSizeN} size="sm" label="Size" />
          <Knob
            value={decayN}
            onValueChange={setDecayN}
            size="sm"
            label="Decay"
          />

          <Knob value={preN} onValueChange={setPreN} size="sm" label="Pre" />
          <Knob value={mixN} onValueChange={setMixN} size="sm" label="Mix" />
          <Knob
            value={widthN}
            onValueChange={setWidthN}
            size="sm"
            label="Width"
          />
        </div>

        <div className="flex gap-6">
          <Knob value={dampN} onValueChange={setDampN} size="sm" label="Tone" />
          <Knob
            value={lowCutN}
            onValueChange={setLowCutN}
            size="sm"
            label="LowCut"
          />
          <Knob
            value={highCutN}
            onValueChange={setHighCutN}
            size="sm"
            label="HighCut"
          />
        </div>

        <div className="flex gap-6">
          <Knob
            value={diffusionN}
            onValueChange={setDiffusionN}
            size="sm"
            label="Diffuse"
          />
          <Knob
            value={modRateN}
            onValueChange={setModRateN}
            size="sm"
            label="ModRate"
          />
          <Knob
            value={modDepthN}
            onValueChange={setModDepthN}
            size="sm"
            label="ModDepth"
          />
        </div>

        <div className="flex gap-6">
          <Knob
            value={erLevelN}
            onValueChange={setErLevelN}
            size="sm"
            label="ER Lvl"
          />
          <Knob
            value={erTimeN}
            onValueChange={setErTimeN}
            size="sm"
            label="ER Time"
          />
          <div className="flex items-center gap-2">
            <Button
              variant={freezeOn ? 'default' : 'secondary'}
              onClick={() => setFreezeOn((v) => !v)}
            >
              Freeze
            </Button>
          </div>
        </div>

        <div className="flex gap-6">
          <Knob
            value={duckAmountN}
            onValueChange={setDuckAmountN}
            size="sm"
            label="Duck"
          />
          <Knob
            value={duckReleaseN}
            onValueChange={setDuckReleaseN}
            size="sm"
            label="Release"
          />
        </div>
      </div>

      <div className="flex-grow" />

      {/* Ports */}
      <div className="flex flex-col gap-1">
        {/* CV Row 1 */}
        {/* <div className="flex justify-between items-end">
          <div className="flex flex-col items-center gap-3">
            <Knob value={sizeCvAmtN} onValueChange={setSizeCvAmtN} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-size-cv`}
              type="input"
              label="SIZE"
              audioType="cv"
              audioNode={sizeCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={dampCvAmtN} onValueChange={setDampCvAmtN} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-damp-cv`}
              type="input"
              label="TONE"
              audioType="cv"
              audioNode={dampCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob
              value={decayCvAmtN}
              onValueChange={setDecayCvAmtN}
              size="xs"
            />
            <VLine />
            <Port
              id={`${moduleId}-decay-cv`}
              type="input"
              label="DECAY"
              audioType="cv"
              audioNode={decayCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={mixCvAmtN} onValueChange={setMixCvAmtN} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-mix-cv`}
              type="input"
              label="MIX"
              audioType="cv"
              audioNode={mixCvInRef.current ?? undefined}
            />
          </div>
        </div> */}

        {/* CV Row 2 */}
        {/* <div className="flex justify-between items-end mt-2">
          <div className="flex flex-col items-center gap-3">
            <Knob
              value={widthCvAmtN}
              onValueChange={setWidthCvAmtN}
              size="xs"
            />
            <VLine />
            <Port
              id={`${moduleId}-width-cv`}
              type="input"
              label="WIDTH"
              audioType="cv"
              audioNode={widthCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob
              value={lowCutCvAmtN}
              onValueChange={setLowCutCvAmtN}
              size="xs"
            />
            <VLine />
            <Port
              id={`${moduleId}-lowcut-cv`}
              type="input"
              label="LOWCUT"
              audioType="cv"
              audioNode={lowCutCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob
              value={highCutCvAmtN}
              onValueChange={setHighCutCvAmtN}
              size="xs"
            />
            <VLine />
            <Port
              id={`${moduleId}-highcut-cv`}
              type="input"
              label="HIGHCUT"
              audioType="cv"
              audioNode={highCutCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob
              value={modDepthCvAmtN}
              onValueChange={setModDepthCvAmtN}
              size="xs"
            />
            <VLine />
            <Port
              id={`${moduleId}-moddepth-cv`}
              type="input"
              label="MODDEPTH"
              audioType="cv"
              audioNode={modDepthCvInRef.current ?? undefined}
            />
          </div>
        </div> */}

        {/* CV Row 3 */}
        {/* <div className="flex justify-between items-end mt-2">
          <div className="flex flex-col items-center gap-3">
            <Knob
              value={modRateCvAmtN}
              onValueChange={setModRateCvAmtN}
              size="xs"
            />
            <VLine />
            <Port
              id={`${moduleId}-modrate-cv`}
              type="input"
              label="MODRATE"
              audioType="cv"
              audioNode={modRateCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Knob value={duckCvAmtN} onValueChange={setDuckCvAmtN} size="xs" />
            <VLine />
            <Port
              id={`${moduleId}-duck-cv`}
              type="input"
              label="DUCK"
              audioType="cv"
              audioNode={duckCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="h-6" />
            <VLine />
            <Port
              id={`${moduleId}-freeze-gate`}
              type="input"
              label="FREEZE"
              audioType="cv"
              audioNode={freezeCvInRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="h-6" />
            <VLine />
            <Port
              id={`${moduleId}-sidechain-in`}
              type="input"
              label="SIDECHN"
              audioType="audio"
              audioNode={sidechainInRef.current ?? undefined}
            />
          </div>
        </div> */}

        {/* Audio I/O */}
        <div className="flex justify-between items-end mt-2">
          <Port
            id={`${moduleId}-in-l`}
            type="input"
            label="IN L"
            audioType="audio"
            audioNode={inLRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-in-r`}
            type="input"
            label="IN R"
            audioType="audio"
            audioNode={inRRef.current ?? undefined}
          />
          <PortGroup>
            <Port
              id={`${moduleId}-out-l`}
              type="output"
              label="OUT L"
              audioType="audio"
              audioNode={outLRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-out-r`}
              type="output"
              label="OUT R"
              audioType="audio"
              audioNode={outRRef.current ?? undefined}
            />
          </PortGroup>
        </div>
      </div>
    </ModuleContainer>
  )
}
