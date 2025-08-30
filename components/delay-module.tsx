"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ModuleContainer } from "./module-container"
import { Knob } from "@/components/ui/knob"
import { Port } from "./port"
import { Button } from "@/components/ui/button"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { mapLinear } from "@/lib/utils"
import { useConnections } from "@/components/connection-manager"
import { useModuleInit } from "@/hooks/use-module-init"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

// Physical ranges (knobs are 0..1 → use mapLinear)
const TIME_MIN = 0.01, TIME_MAX = 2.0
const FB_MIN   = 0.0,  FB_MAX   = 0.95
const TONE_MIN = 500,  TONE_MAX = 12000

type Mode = 0 | 1 | 2 // 0=Mono, 1=Stereo, 2=PingPong

export function DelayModule({ moduleId }: { moduleId: string }) {
  // Normalized UI state (0..1)
  const [timeN, setTimeN] = useState([0.25 / (TIME_MAX - TIME_MIN)]) // visually fine; actual mapped each push
  const [fbN,   setFbN]   = useState([0.3 / FB_MAX])
  const [mixN,  setMixN]  = useState([0.5])
  const [toneN, setToneN] = useState([ (8000 - TONE_MIN) / (TONE_MAX - TONE_MIN) ])

  // CV depths (0..1) used inside worklet
  const [timeCvAmtN, setTimeCvAmtN] = useState([0])
  const [fbCvAmtN,   setFbCvAmtN]   = useState([0])

  const [mode, setMode] = useState<Mode>(0)
  const [clocked, setClocked] = useState(false)

  // Graph
  const acRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)

  // Audio I/O nodes
  const inLRef = useRef<GainNode | null>(null)
  const inRRef = useRef<GainNode | null>(null)
  const outLRef = useRef<GainNode | null>(null)
  const outRRef = useRef<GainNode | null>(null)

  // CV inputs
  const timeCvInRef = useRef<GainNode | null>(null)
  const fbCvInRef   = useRef<GainNode | null>(null)
  const clockInRef  = useRef<GainNode | null>(null)

  const mergerRef = useRef<ChannelMergerNode | null>(null)
  const splitterRef = useRef<ChannelSplitterNode | null>(null)

  const { connections } = useConnections()

  const setParam = (name: string, v: number, tSmooth = 0.02) => {
    const ac = acRef.current, w = workletRef.current
    if (!ac || !w) return
    const p = w.parameters.get(name)
    if (!p) return
    // light smoothing for clicks-free updates
    p.setTargetAtTime(v, ac.currentTime, tSmooth)
  }

  const init = useCallback(async () => {
    if (workletRef.current) return
    
    const ac = getAudioContext()
    acRef.current = ac

    await ac.audioWorklet.addModule("/delay-processor.js")

    // I/O
    inLRef.current = ac.createGain(); inLRef.current.gain.value = 1
    inRRef.current = ac.createGain(); inRRef.current.gain.value = 1
    outLRef.current = ac.createGain(); outLRef.current.gain.value = 1
    outRRef.current = ac.createGain(); outRRef.current.gain.value = 1

    // CV inputs (pass straight into the worklet, audio-rate)
    timeCvInRef.current = ac.createGain(); timeCvInRef.current.gain.value = 1
    fbCvInRef.current   = ac.createGain(); fbCvInRef.current.gain.value = 1
    clockInRef.current  = ac.createGain(); clockInRef.current.gain.value = 1

    // Merge L/R → stereo input 0
    const merger = ac.createChannelMerger(2); mergerRef.current = merger
    inLRef.current.connect(merger, 0, 0)
    inRRef.current.connect(merger, 0, 1)

    // Worklet: 4 inputs (stereo audio, timeCV, fbCV, clock), 1 stereo output
    const w = new AudioWorkletNode(ac, "delay-processor", {
      numberOfInputs: 4,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    })
    workletRef.current = w

    // Wire inputs to inputs[0..3]
    merger.connect(w, 0, 0)                        // stereo audio
    timeCvInRef.current.connect(w, 0, 1)           // time CV
    fbCvInRef.current.connect(w, 0, 2)             // feedback CV
    clockInRef.current.connect(w, 0, 3)            // clock input

    // Split stereo output → two mono port nodes
    const splitter = ac.createChannelSplitter(2); splitterRef.current = splitter
    w.connect(splitter)
    splitter.connect(outLRef.current, 0)
    splitter.connect(outRRef.current, 1)

    // Initial params (map knobs 0..1 → physical)
    setParam("time",      mapLinear(timeN[0], TIME_MIN, TIME_MAX), 0.01)
    setParam("feedback",  mapLinear(fbN[0],   FB_MIN,   FB_MAX),   0.02)
    setParam("mix",       Math.max(0, Math.min(1, mixN[0])),       0.02)
    setParam("toneHz",    mapLinear(toneN[0], TONE_MIN, TONE_MAX), 0.02)
    setParam("mode",      mode,                                     0.0)
    setParam("timeCvAmt", Math.max(0, Math.min(1, timeCvAmtN[0])), 0.02)
    setParam("fbCvAmt",   Math.max(0, Math.min(1, fbCvAmtN[0])),   0.02)
    setParam("clocked",   clocked ? 1 : 0,                         0.0)
    setParam("clockMult", Math.max(0, Math.min(1, timeN[0])),      0.02)
    // Initial dryMono state based on current connections
    const inLId = `${moduleId}-in-l`
    const inRId = `${moduleId}-in-r`
    const hasL = connections.some((e) => e.to === inLId)
    const hasR = connections.some((e) => e.to === inRId)
    const dryMono = (hasL && !hasR) || (!hasL && hasR)
    setParam("dryMono", dryMono ? 1 : 0, 0.0)

    console.log("[DELAY] initialized")
  }, [mode, clocked, timeN, fbN, mixN, toneN, timeCvAmtN, fbCvAmtN, connections, moduleId])

  const { isReady, initError, retryInit } = useModuleInit(init, "DELAY")

  // push param updates
  useEffect(() => {
    setParam("time",     mapLinear(timeN[0], TIME_MIN, TIME_MAX))
    setParam("clockMult", Math.max(0, Math.min(1, timeN[0])))
  }, [timeN])
  useEffect(() => { setParam("feedback", mapLinear(fbN[0],   FB_MIN,   FB_MAX))   }, [fbN])
  useEffect(() => { setParam("mix",      Math.max(0, Math.min(1, mixN[0])))       }, [mixN])
  useEffect(() => { setParam("toneHz",   mapLinear(toneN[0], TONE_MIN, TONE_MAX)) }, [toneN])
  useEffect(() => { setParam("mode",     mode, 0.0)                                }, [mode])
  useEffect(() => { setParam("timeCvAmt",Math.max(0, Math.min(1, timeCvAmtN[0]))) }, [timeCvAmtN])
  useEffect(() => { setParam("fbCvAmt",  Math.max(0, Math.min(1, fbCvAmtN[0])))   }, [fbCvAmtN])
  useEffect(() => { setParam("clocked",  clocked ? 1 : 0, 0.0)                     }, [clocked])
  // Balance dry path when exactly one input is connected
  useEffect(() => {
    if (!workletRef.current) return
    const inLId = `${moduleId}-in-l`
    const inRId = `${moduleId}-in-r`
    const hasL = connections.some((e) => e.to === inLId)
    const hasR = connections.some((e) => e.to === inRId)
    const dryMono = (hasL && !hasR) || (!hasL && hasR)
    setParam("dryMono", dryMono ? 1 : 0, 0.0)
  }, [connections, moduleId])

  // Patch save/load (expose physical values + mode)
  useEffect(() => {
    const el = document.querySelector(`[data-module-id="${moduleId}"]`) as any
    if (!el) return
    el.getParameters = () => ({
      time:   mapLinear(timeN[0], TIME_MIN, TIME_MAX),
      feedback: mapLinear(fbN[0], FB_MIN, FB_MAX),
      mix:    Math.max(0, Math.min(1, mixN[0])),
      toneHz: mapLinear(toneN[0], TONE_MIN, TONE_MAX),
      mode,
      timeCvAmt: timeCvAmtN[0],
      fbCvAmt:   fbCvAmtN[0],
      clocked,
    })
    el.setParameters = (p: any) => {
      if (p.time      !== undefined) setTimeN([ (p.time - TIME_MIN) / (TIME_MAX - TIME_MIN) ])
      if (p.feedback  !== undefined) setFbN([ p.feedback / FB_MAX ])
      if (p.mix       !== undefined) setMixN([ Math.max(0, Math.min(1, p.mix)) ])
      if (p.toneHz    !== undefined) setToneN([ (p.toneHz - TONE_MIN) / (TONE_MAX - TONE_MIN) ])
      if (p.mode      !== undefined) setMode(Math.max(0, Math.min(2, Math.floor(p.mode))) as Mode)
      if (p.timeCvAmt !== undefined) setTimeCvAmtN([ Math.max(0, Math.min(1, p.timeCvAmt)) ])
      if (p.fbCvAmt   !== undefined) setFbCvAmtN([ Math.max(0, Math.min(1, p.fbCvAmt)) ])
      if (p.clocked   !== undefined) setClocked(!!p.clocked)
    }
  }, [moduleId, timeN, fbN, mixN, toneN, mode, timeCvAmtN, fbCvAmtN, clocked])

  return (
    <ModuleContainer title="Delay" moduleId={moduleId}>
      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-1 mx-auto">
        {[
          { m: 0 as Mode, label: "Mono" },
          { m: 1 as Mode, label: "Stereo" },
          { m: 2 as Mode, label: "Ping" },
        ].map(({ m, label }) => (
          <Button
            key={m}
            size="sm"
            variant={mode === m ? "default" : "secondary"}
            className="h-8 px-2"
            onClick={() => setMode(m)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex flex-col items-center gap-4 mt-2">
        <Knob value={timeN} onValueChange={setTimeN} size="lg" label="Time" steps={clocked ? 16 : undefined} />
        <div className="flex items-center gap-4">
          <ToggleSwitch label="Clock" value={clocked} onValueChange={setClocked} />
        </div>
        <div className="flex gap-3">
          <Knob value={fbN}   onValueChange={setFbN}   size="sm" label="Feedback" />
          <Knob value={mixN}  onValueChange={setMixN}  size="sm" label="Mix" />
          <Knob value={toneN} onValueChange={setToneN} size="sm" label="Tone" />
        </div>

        {/* CV depths */}
        <div className="grid grid-cols-2 gap-2">
          <Knob value={timeCvAmtN} onValueChange={setTimeCvAmtN} size="xs" label="Time CV" />
          <Knob value={fbCvAmtN}   onValueChange={setFbCvAmtN}   size="xs" label="FB CV" />
        </div>
      </div>

      <div className="flex-grow" />

      {/* Ports */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end gap-2">
          <Port id={`${moduleId}-time-cv`} type="input" label="TIME" audioType="cv" audioNode={timeCvInRef.current ?? undefined} />
          <Port id={`${moduleId}-fb-cv`}   type="input" label="FB"   audioType="cv" audioNode={fbCvInRef.current   ?? undefined} />
          <Port id={`${moduleId}-clk`}     type="input" label="CLK"  audioType="cv" audioNode={clockInRef.current  ?? undefined} />
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
