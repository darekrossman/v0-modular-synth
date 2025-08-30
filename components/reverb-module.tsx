"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ModuleContainer } from "./module-container"
import { Knob } from "@/components/ui/knob"
import { Port } from "./port"
import { Button } from "@/components/ui/button"
import { mapLinear } from "@/lib/utils"
import { useConnections } from "./connection-manager"
import { useModuleInit } from "@/hooks/use-module-init"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

// Mappings
const SIZE_MIN = 0.3, SIZE_MAX = 2.0
const DAMP_MIN = 500, DAMP_MAX = 12000
const PRE_MIN = 0.0, PRE_MAX = 0.25

type Algo = 0 | 1 | 2 // 0=Room, 1=Hall, 2=Plate

export function ReverbModule({ moduleId }: { moduleId: string }) {
  // Normalized UI state (0..1)
  const [sizeN,  setSizeN]  = useState([0.6])
  const [decayN, setDecayN] = useState([0.7])
  const [dampN,  setDampN]  = useState([0.6])
  const [preN,   setPreN]   = useState([0.08 / (PRE_MAX - PRE_MIN)])
  const [mixN,   setMixN]   = useState([0.35])

  // CV depths (0..1)
  const [sizeCvAmtN,  setSizeCvAmtN]  = useState([0])
  const [dampCvAmtN,  setDampCvAmtN]  = useState([0])
  const [decayCvAmtN, setDecayCvAmtN] = useState([0])
  const [mixCvAmtN,   setMixCvAmtN]   = useState([0])

  const [algo, setAlgo] = useState<Algo>(1)

  // Graph
  const acRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)

  // Audio I/O nodes
  const inLRef = useRef<GainNode | null>(null)
  const inRRef = useRef<GainNode | null>(null)
  const outLRef = useRef<GainNode | null>(null)
  const outRRef = useRef<GainNode | null>(null)

  // CV inputs
  const sizeCvInRef  = useRef<GainNode | null>(null)
  const dampCvInRef  = useRef<GainNode | null>(null)
  const decayCvInRef = useRef<GainNode | null>(null)
  const mixCvInRef   = useRef<GainNode | null>(null)

  const mergerRef = useRef<ChannelMergerNode | null>(null)
  const splitterRef = useRef<ChannelSplitterNode | null>(null)

  const { connections } = useConnections()

  const setParam = (name: string, v: number, tSmooth = 0.02) => {
    const ac = acRef.current, w = workletRef.current
    if (!ac || !w) return
    const p = w.parameters.get(name)
    if (!p) return
    p.setTargetAtTime(v, ac.currentTime, tSmooth)
  }

  const init = useCallback(async () => {
    if (workletRef.current) return // Already initialized
    
    const ac = getAudioContext()
    acRef.current = ac
    await ac.audioWorklet.addModule("/reverb-processor.js")

    // I/O
    inLRef.current = ac.createGain(); inLRef.current.gain.value = 1
    inRRef.current = ac.createGain(); inRRef.current.gain.value = 1
    outLRef.current = ac.createGain(); outLRef.current.gain.value = 1
    outRRef.current = ac.createGain(); outRRef.current.gain.value = 1

    // CV inputs
    sizeCvInRef.current  = ac.createGain(); sizeCvInRef.current.gain.value = 1
    dampCvInRef.current  = ac.createGain(); dampCvInRef.current.gain.value = 1
    decayCvInRef.current = ac.createGain(); decayCvInRef.current.gain.value = 1
    mixCvInRef.current   = ac.createGain(); mixCvInRef.current.gain.value = 1

    // Merge L/R → stereo input 0
    const merger = ac.createChannelMerger(2); mergerRef.current = merger
    inLRef.current.connect(merger, 0, 0)
    inRRef.current.connect(merger, 0, 1)

    // Worklet: 5 inputs (stereo audio, sizeCV, dampCV, decayCV, mixCV), 1 stereo output
    const w = new AudioWorkletNode(ac, "reverb-processor", {
      numberOfInputs: 5,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    })
    workletRef.current = w

    // Wire inputs
    merger.connect(w, 0, 0)
    sizeCvInRef.current.connect(w, 0, 1)
    dampCvInRef.current.connect(w, 0, 2)
    decayCvInRef.current.connect(w, 0, 3)
    mixCvInRef.current.connect(w, 0, 4)

    // Split stereo output → two mono port nodes
    const splitter = ac.createChannelSplitter(2); splitterRef.current = splitter
    w.connect(splitter)
    splitter.connect(outLRef.current, 0)
    splitter.connect(outRRef.current, 1)

    // Initial params
    setParam("size",      Math.max(0, Math.min(1, sizeN[0])),       0.02)
    setParam("decay",     Math.max(0, Math.min(1, decayN[0])),      0.02)
    setParam("dampHz",    mapLinear(dampN[0], DAMP_MIN, DAMP_MAX),  0.02)
    setParam("preDelay",  mapLinear(preN[0],  PRE_MIN,  PRE_MAX),   0.02)
    setParam("mix",       Math.max(0, Math.min(1, mixN[0])),        0.02)
    setParam("type",      algo,                                      0.0)
    setParam("sizeCvAmt", Math.max(0, Math.min(1, sizeCvAmtN[0])),  0.02)
    setParam("dampCvAmt", Math.max(0, Math.min(1, dampCvAmtN[0])),  0.02)
    setParam("decayCvAmt",Math.max(0, Math.min(1, decayCvAmtN[0])), 0.02)
    setParam("mixCvAmt",  Math.max(0, Math.min(1, mixCvAmtN[0])),   0.02)

    // dryMono based on connections
    const inLId = `${moduleId}-in-l`
    const inRId = `${moduleId}-in-r`
    const hasL = connections.some((e) => e.to === inLId)
    const hasR = connections.some((e) => e.to === inRId)
    setParam("dryMono", hasL !== hasR ? 1 : 0, 0.0)

    // eslint-disable-next-line no-console
    console.log("[REVERB] initialized")
  }, [connections, moduleId, sizeN, decayN, dampN, preN, mixN, algo, sizeCvAmtN, dampCvAmtN, decayCvAmtN, mixCvAmtN])

  // Use the module initialization hook
  const { isReady, initError, retryInit } = useModuleInit(init, "REVERB")

  // Push updates
  useEffect(() => { setParam("size",  Math.max(0, Math.min(1, sizeN[0]))) }, [sizeN])
  useEffect(() => { setParam("decay", Math.max(0, Math.min(1, decayN[0]))) }, [decayN])
  useEffect(() => { setParam("dampHz",mapLinear(dampN[0], DAMP_MIN, DAMP_MAX)) }, [dampN])
  useEffect(() => { setParam("preDelay", mapLinear(preN[0], PRE_MIN, PRE_MAX)) }, [preN])
  useEffect(() => { setParam("mix",   Math.max(0, Math.min(1, mixN[0]))) }, [mixN])
  useEffect(() => { setParam("type",  algo, 0.0) }, [algo])

  useEffect(() => { setParam("sizeCvAmt",  Math.max(0, Math.min(1, sizeCvAmtN[0]))) }, [sizeCvAmtN])
  useEffect(() => { setParam("dampCvAmt",  Math.max(0, Math.min(1, dampCvAmtN[0]))) }, [dampCvAmtN])
  useEffect(() => { setParam("decayCvAmt", Math.max(0, Math.min(1, decayCvAmtN[0]))) }, [decayCvAmtN])
  useEffect(() => { setParam("mixCvAmt",   Math.max(0, Math.min(1, mixCvAmtN[0]))) }, [mixCvAmtN])

  // dry mono whenever connection changes
  useEffect(() => {
    const inLId = `${moduleId}-in-l`
    const inRId = `${moduleId}-in-r`
    const hasL = connections.some((e) => e.to === inLId)
    const hasR = connections.some((e) => e.to === inRId)
    setParam("dryMono", hasL !== hasR ? 1 : 0, 0.0)
  }, [connections, moduleId])

  // Patch save/load
  useEffect(() => {
    const el = document.querySelector(`[data-module-id="${moduleId}"]`) as any
    if (!el) return
    el.getParameters = () => ({
      size:  sizeN[0],
      decay: decayN[0],
      dampHz: mapLinear(dampN[0], DAMP_MIN, DAMP_MAX),
      preDelay: mapLinear(preN[0], PRE_MIN, PRE_MAX),
      mix: mixN[0],
      algo,
      sizeCvAmt:  sizeCvAmtN[0],
      dampCvAmt:  dampCvAmtN[0],
      decayCvAmt: decayCvAmtN[0],
      mixCvAmt:   mixCvAmtN[0],
    })
    el.setParameters = (p: any) => {
      if (p.size     !== undefined) setSizeN([ Math.max(0, Math.min(1, p.size)) ])
      if (p.decay    !== undefined) setDecayN([ Math.max(0, Math.min(1, p.decay)) ])
      if (p.dampHz   !== undefined) setDampN([ (p.dampHz - DAMP_MIN) / (DAMP_MAX - DAMP_MIN) ])
      if (p.preDelay !== undefined) setPreN([ (p.preDelay - PRE_MIN) / (PRE_MAX - PRE_MIN) ])
      if (p.mix      !== undefined) setMixN([ Math.max(0, Math.min(1, p.mix)) ])
      if (p.algo     !== undefined) setAlgo(Math.max(0, Math.min(2, Math.floor(p.algo))) as Algo)
      if (p.sizeCvAmt!== undefined) setSizeCvAmtN([ Math.max(0, Math.min(1, p.sizeCvAmt)) ])
      if (p.dampCvAmt!== undefined) setDampCvAmtN([ Math.max(0, Math.min(1, p.dampCvAmt)) ])
      if (p.decayCvAmt!==undefined) setDecayCvAmtN([ Math.max(0, Math.min(1, p.decayCvAmt)) ])
      if (p.mixCvAmt !== undefined) setMixCvAmtN([ Math.max(0, Math.min(1, p.mixCvAmt)) ])
    }
  }, [moduleId, sizeN, decayN, dampN, preN, mixN, algo, sizeCvAmtN, dampCvAmtN, decayCvAmtN, mixCvAmtN])

  return (
    <ModuleContainer title="Reverb" moduleId={moduleId}>
      {/* Algo selector */}
      <div className="grid grid-cols-3 gap-1 mx-auto">
        {[
          { a: 0 as Algo, label: "Room" },
          { a: 1 as Algo, label: "Hall" },
          { a: 2 as Algo, label: "Plate" },
        ].map(({ a, label }) => (
          <Button
            key={a}
            size="sm"
            variant={algo === a ? "default" : "secondary"}
            className="h-8 px-2"
            onClick={() => setAlgo(a)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 mt-2">
        <div className="flex gap-3">
          <Knob value={sizeN}  onValueChange={setSizeN}  size="sm" label="Size" />
          <Knob value={decayN} onValueChange={setDecayN} size="sm" label="Decay" />
          <Knob value={dampN}  onValueChange={setDampN}  size="sm" label="Tone" />
          <Knob value={preN}   onValueChange={setPreN}   size="sm" label="Pre" />
          <Knob value={mixN}   onValueChange={setMixN}   size="sm" label="Mix" />
        </div>

        {/* CV depths */}
        <div className="grid grid-cols-4 gap-2">
          <Knob value={sizeCvAmtN}  onValueChange={setSizeCvAmtN}  size="xs" label="Size CV" />
          <Knob value={dampCvAmtN}  onValueChange={setDampCvAmtN}  size="xs" label="Tone CV" />
          <Knob value={decayCvAmtN} onValueChange={setDecayCvAmtN} size="xs" label="Decay CV" />
          <Knob value={mixCvAmtN}   onValueChange={setMixCvAmtN}   size="xs" label="Mix CV" />
        </div>
      </div>

      <div className="flex-grow" />

      {/* Ports */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end gap-2">
          <Port id={`${moduleId}-size-cv`}  type="input" label="SIZE"  audioType="cv" audioNode={sizeCvInRef.current  ?? undefined} />
          <Port id={`${moduleId}-damp-cv`}  type="input" label="TONE"  audioType="cv" audioNode={dampCvInRef.current  ?? undefined} />
          <Port id={`${moduleId}-decay-cv`} type="input" label="DECAY" audioType="cv" audioNode={decayCvInRef.current ?? undefined} />
          <Port id={`${moduleId}-mix-cv`}   type="input" label="MIX"   audioType="cv" audioNode={mixCvInRef.current   ?? undefined} />
        </div>
        <div className="flex justify-between items-end gap-2">
          <Port id={`${moduleId}-in-l`}  type="input"  label="IN L"  audioType="audio" audioNode={inLRef.current  ?? undefined} />
          <Port id={`${moduleId}-in-r`}  type="input"  label="IN R"  audioType="audio" audioNode={inRRef.current  ?? undefined} />
          <Port id={`${moduleId}-out-l`} type="output" label="OUT L" audioType="audio" audioNode={outLRef.current ?? undefined} />
          <Port id={`${moduleId}-out-r`} type="output" label="OUT R" audioType="audio" audioNode={outRRef.current ?? undefined} />
        </div>
      </div>
    </ModuleContainer>
  )
}
