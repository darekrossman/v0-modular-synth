"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ModuleContainer } from "@/components/module-container"
import { Knob } from "@/components/ui/knob"
import { Port } from "@/components/port"
import { useConnections } from "@/components/connection-manager"
import * as utils from "@/lib/utils"
import { useModuleInit } from "@/hooks/use-module-init"
import { useModulePatch } from "./patch-manager"

// --- Shared AudioContext helper (same pattern as OutputModule) ---
function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

// Optional: wire these if your host expects them
const getParameters = () => { }
const setParameters = (_: any) => { }

const MIN_CUTOFF = 20
const MAX_CUTOFF = 20000

export function LowPassFilterModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    cutoff: cutoff[0],
    resonance: resonance[0],
    drive: drive[0],
    resComp: resComp[0],
    fbSat: fbSat[0],
    input1Level: input1Level[0],
    input2Level: input2Level[0],
    input3Level: input3Level[0],
    cvAttenuation: cvAttenuation[0],
  }))

  const [cutoff, setCutoff] = useState([initialParameters?.cutoff ?? 1.0])
  const [resonance, setResonance] = useState([initialParameters?.resonance ?? 0.0])
  const [drive, setDrive] = useState([initialParameters?.drive ?? 0.0])
  const [resComp, setResComp] = useState([initialParameters?.resComp ?? 0.6])
  const [fbSat, setFbSat] = useState([initialParameters?.fbSat ?? 0.09])
  const [input1Level, setInput1Level] = useState([initialParameters?.input1Level ?? 1])
  const [input2Level, setInput2Level] = useState([initialParameters?.input2Level ?? 1])
  const [input3Level, setInput3Level] = useState([initialParameters?.input3Level ?? 1])
  const [cvAttenuation, setCvAttenuation] = useState([initialParameters?.cvAttenuation ?? 1])

  const [postGain] = useState(1.1) // Keeping as constant since it's calculated from drive

  const acRef = useRef<AudioContext | null>(null)

  // Treat input gain nodes as the *actual port* nodes
  const in1Ref = useRef<GainNode | null>(null)
  const in2Ref = useRef<GainNode | null>(null)
  const in3Ref = useRef<GainNode | null>(null)

  const mixRef = useRef<GainNode | null>(null)

  const cutoffCVInRef = useRef<GainNode | null>(null)
  const resCVInRef = useRef<GainNode | null>(null)

  const workletRef = useRef<AudioWorkletNode | null>(null)
  const outRef = useRef<GainNode | null>(null)

  const { registerAudioNode } = useConnections()

  // ---- helpers --------------------------------------------------------------
  const setMono = (node: AudioNode) => {
    try {
      ; (node as any).channelCount = 1
        ; (node as any).channelCountMode = "explicit"
        ; (node as any).channelInterpretation = "discrete"
    } catch { }
  }

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

  // Update parameters via useEffect like other modules
  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const cutHz = utils.mapExponential(cutoff[0], MIN_CUTOFF, MAX_CUTOFF)
    w.parameters.get("cutoff")?.setTargetAtTime(cutHz, ac.currentTime, 0.05) // Slower for stability
  }, [cutoff])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const resNorm = Math.min(0.995, Math.pow(clamp01(resonance[0]), 0.95))
    w.parameters.get("resonance")?.setTargetAtTime(resNorm, ac.currentTime, 0.05) // Slower for stability
  }, [resonance])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    w.parameters.get("drive")?.setTargetAtTime(drive[0], ac.currentTime, 0.05)
    const pg = postGain + 0.1 * drive[0]
    w.parameters.get("postGain")?.setTargetAtTime(pg, ac.currentTime, 0.05)
  }, [drive, postGain])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    w.parameters.get("resComp")?.setTargetAtTime(resComp[0], ac.currentTime, 0.05)
  }, [resComp])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    w.parameters.get("fbSat")?.setTargetAtTime(fbSat[0], ac.currentTime, 0.05)
  }, [fbSat])

  useEffect(() => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    // CV attenuation is handled in the worklet
    w.parameters.get("cvAmount")?.setTargetAtTime(cvAttenuation[0], ac.currentTime, 0.05)
  }, [cvAttenuation])

  useEffect(() => {
    const t = acRef.current?.currentTime ?? 0
    in1Ref.current?.gain.setTargetAtTime(input1Level[0], t, 0.03) // Slower for stability
  }, [input1Level])

  useEffect(() => {
    const t = acRef.current?.currentTime ?? 0
    in2Ref.current?.gain.setTargetAtTime(input2Level[0], t, 0.03) // Slower for stability
  }, [input2Level])

  useEffect(() => {
    const t = acRef.current?.currentTime ?? 0
    in3Ref.current?.gain.setTargetAtTime(input3Level[0], t, 0.03) // Slower for stability
  }, [input3Level])

  useModuleInit(async () => {
    if (workletRef.current) return // Already initialized

    const ac = getAudioContext()
    acRef.current = ac

    await ac.audioWorklet.addModule("/ladder-filter-processor.js")

    // Inputs as ports (mono)
    in1Ref.current = ac.createGain(); setMono(in1Ref.current); in1Ref.current.gain.value = input1Level[0]
    in2Ref.current = ac.createGain(); setMono(in2Ref.current); in2Ref.current.gain.value = input2Level[0]
    in3Ref.current = ac.createGain(); setMono(in3Ref.current); in3Ref.current.gain.value = input3Level[0]

    // Register inputs with new system
    registerAudioNode(`${moduleId}-audio-in-1`, in1Ref.current, "input")
    registerAudioNode(`${moduleId}-audio-in-2`, in2Ref.current, "input")
    registerAudioNode(`${moduleId}-audio-in-3`, in3Ref.current, "input")

    // CV inputs - connect directly to worklet for audio-rate modulation
    cutoffCVInRef.current = ac.createGain(); cutoffCVInRef.current.gain.value = 1
    resCVInRef.current = ac.createGain(); resCVInRef.current.gain.value = 1
    registerAudioNode(`${moduleId}-cutoff-cv-in`, cutoffCVInRef.current, "input")
    registerAudioNode(`${moduleId}-resonance-cv-in`, resCVInRef.current, "input")

    // Mixer (mono)
    mixRef.current = ac.createGain(); setMono(mixRef.current); mixRef.current.gain.value = 1
    in1Ref.current.connect(mixRef.current)
    in2Ref.current.connect(mixRef.current)
    in3Ref.current.connect(mixRef.current)

    // Worklet with CV inputs
    const initCut = utils.mapExponential(cutoff[0], MIN_CUTOFF, MAX_CUTOFF)
    workletRef.current = new AudioWorkletNode(ac, "ladder-filter-processor", {
      numberOfInputs: 3, // audio, cutoff CV, resonance CV
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      parameterData: {
        cutoff: initCut,
        resonance: clamp01(resonance[0]),
        drive: drive[0],
        postGain: postGain,
        resComp: resComp[0],
        fbSat: fbSat[0],
        cvAmount: cvAttenuation[0],
      },
    } as any)

    // Connect audio and CV inputs to worklet
    mixRef.current.connect(workletRef.current!, 0, 0) // audio input
    cutoffCVInRef.current.connect(workletRef.current!, 0, 1) // cutoff CV
    resCVInRef.current.connect(workletRef.current!, 0, 2) // resonance CV

    // Output (mono) + register as port
    outRef.current = ac.createGain(); setMono(outRef.current); outRef.current.gain.value = 1
    workletRef.current!.connect(outRef.current)
    registerAudioNode(`${moduleId}-audio-out`, outRef.current, "output")
  }, moduleId)

  return (
    <ModuleContainer title="Filter" moduleId={moduleId}>
      <div className="flex flex-col items-center justify-center gap-4">
        <Knob value={cutoff} onValueChange={setCutoff} size="lg" data-param="cutoff" label="Cutoff" />
        <div className="flex gap-4">
          <Knob value={resonance} onValueChange={setResonance} size="md" data-param="resonance" label="Res" />
          <Knob value={drive} onValueChange={setDrive} size="md" data-param="drive" label="Drive" />
        </div>
        <div className="flex gap-2">
          <Knob value={cvAttenuation} onValueChange={setCvAttenuation} size="sm" data-param="cvAttenuation" label="CV Amt" />
          <Knob value={resComp} onValueChange={setResComp} size="sm" data-param="resComp" label="R Comp" />
          <Knob value={fbSat} onValueChange={setFbSat} size="sm" data-param="fbSat" label="FB Sat" />
        </div>
        <div className="flex gap-2">
          <Knob value={input1Level} onValueChange={setInput1Level} size="sm" data-param="input1Level" label="IN 1" />
          <Knob value={input2Level} onValueChange={setInput2Level} size="sm" data-param="input2Level" label="IN 2" />
          <Knob value={input3Level} onValueChange={setInput3Level} size="sm" data-param="input3Level" label="IN 3" />
        </div>
      </div>

      <div className="flex-grow" />

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end gap-2">
          <Port id={`${moduleId}-audio-in-1`} type="input" label="IN 1" audioType="audio" audioNode={in1Ref.current ?? undefined} />
          <Port id={`${moduleId}-audio-in-2`} type="input" label="IN 2" audioType="audio" audioNode={in2Ref.current ?? undefined} />
          <Port id={`${moduleId}-audio-in-3`} type="input" label="IN 3" audioType="audio" audioNode={in3Ref.current ?? undefined} />
        </div>
        <div className="flex justify-between items-end gap-2">
          <Port id={`${moduleId}-cutoff-cv-in`} type="input" label="CUTOFF" audioType="cv" audioNode={cutoffCVInRef.current ?? undefined} />
          <Port id={`${moduleId}-resonance-cv-in`} type="input" label="RES" audioType="cv" audioNode={resCVInRef.current ?? undefined} />
          <Port id={`${moduleId}-audio-out`} type="output" label="OUT" audioType="audio" audioNode={outRef.current ?? undefined} />
        </div>
      </div>
    </ModuleContainer>
  )
}
