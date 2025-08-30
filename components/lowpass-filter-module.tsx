"use client"

import { useState, useRef, useEffect } from "react"
import { ModuleContainer } from "@/components/module-container"
import { Knob } from "@/components/ui/knob"
import { Port } from "@/components/port"
import { useConnections } from "@/components/connection-manager"
import * as utils from "@/lib/utils"

// --- Shared AudioContext helper (same pattern as OutputModule) ---
function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

// Optional: wire these if your host expects them
const getParameters = () => {}
const setParameters = (_: any) => {}

const MIN_CUTOFF = 20
const MAX_CUTOFF = 20000

export function LowPassFilterModule({ moduleId }: { moduleId: string }) {
  const [uiUpdateTrigger, setUiUpdateTrigger] = useState(0)

  const paramsRef = useRef({
    cutoff: 1.0,
    resonance: 0.0,
    drive: 0.0,
    postGain: 1.1,
    resComp: 0.9,
    fbSat: 0.09,
    input1Level: 1,
    input2Level: 1,
    input3Level: 1,
    cvAttenuation: 1,
  })

  const acRef = useRef<AudioContext | null>(null)

  // Treat input gain nodes as the *actual port* nodes
  const in1Ref = useRef<GainNode | null>(null)
  const in2Ref = useRef<GainNode | null>(null)
  const in3Ref = useRef<GainNode | null>(null)

  const mixRef = useRef<GainNode | null>(null)

  const cutoffCVInRef = useRef<GainNode | null>(null)
  const resCVInRef = useRef<GainNode | null>(null)
  const cutoffAnalyserRef = useRef<AnalyserNode | null>(null)
  const resAnalyserRef = useRef<AnalyserNode | null>(null)

  const workletRef = useRef<AudioWorkletNode | null>(null)
  const outRef = useRef<GainNode | null>(null)

  const cvCutValRef = useRef(0)
  const cvResValRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const { registerAudioNode } = useConnections()

  // ---- helpers --------------------------------------------------------------
  const setMono = (node: AudioNode) => {
    try {
      ;(node as any).channelCount = 1
      ;(node as any).channelCountMode = "explicit"
      ;(node as any).channelInterpretation = "discrete"
    } catch {}
  }

  const pushInputLevels = () => {
    const t = acRef.current?.currentTime ?? 0
    in1Ref.current?.gain.setTargetAtTime(paramsRef.current.input1Level, t, 0.01)
    in2Ref.current?.gain.setTargetAtTime(paramsRef.current.input2Level, t, 0.01)
    in3Ref.current?.gain.setTargetAtTime(paramsRef.current.input3Level, t, 0.01)
  }

  const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

  const updateFilter = () => {
    const ac = acRef.current
    const w = workletRef.current
    if (!ac || !w) return
    const now = ac.currentTime

    // Base cutoff from knob (0..1 → MIN..MAX)
    const baseCut = utils.mapExponential(paramsRef.current.cutoff, MIN_CUTOFF, MAX_CUTOFF)

    // CV mapping: -1..+1 (audio) ≈ -5..+5 V → full span scaled by cvAttenuation
    const cv = cvCutValRef.current || 0
    const amt = paramsRef.current.cvAttenuation || 0
    const span = MAX_CUTOFF - MIN_CUTOFF
    const cvOffset = ((cv + 1) / 2) * span * amt // normalize -1..+1 → 0..1
    const cutHz = Math.max(MIN_CUTOFF, Math.min(MAX_CUTOFF, baseCut + cvOffset - (span * amt) / 2))

    const tauCut = cutHz < 150 ? 0.045 : cutHz < 400 ? 0.03 : 0.02

    // Resonance (0..1) + optional CV
    const baseRes = clamp01(paramsRef.current.resonance || 0)
    const RES_CV_SENS = 0.5
    const resFromCV = clamp01((cvResValRef.current || 0) * RES_CV_SENS)
    const resMix = clamp01(baseRes + resFromCV)
    const resNorm = Math.min(0.995, Math.pow(resMix, 0.95))
    const tauRes = resNorm > 0.5 ? 0.07 : 0.035

    w.parameters.get("cutoff")?.setTargetAtTime(cutHz, now, tauCut)
    w.parameters.get("resonance")?.setTargetAtTime(resNorm, now, tauRes)
  }

  const updateCvSnapshot = () => {
    let c = 0, r = 0
    if (cutoffAnalyserRef.current) {
      const arr = new Float32Array(cutoffAnalyserRef.current.fftSize)
      cutoffAnalyserRef.current.getFloatTimeDomainData(arr)
      let sum = 0
      for (let i = 0; i < arr.length; i++) sum += arr[i]
      c = sum / arr.length
    }
    if (resAnalyserRef.current) {
      const arr = new Float32Array(resAnalyserRef.current.fftSize)
      resAnalyserRef.current.getFloatTimeDomainData(arr)
      let sum = 0
      for (let i = 0; i < arr.length; i++) sum += arr[i]
      r = sum / arr.length
    }
    cvCutValRef.current = c
    cvResValRef.current = r
  }

  const tick = () => {
    updateCvSnapshot()
    updateFilter()
    pushInputLevels()
    rafRef.current = requestAnimationFrame(tick)
  }

  // ---- UI handlers ----------------------------------------------------------
  const onCutoff = (v: number[]) => {
    paramsRef.current.cutoff = v[0]
    updateFilter()
    setUiUpdateTrigger((x) => x + 1)
  }
  const onRes = (v: number[]) => {
    paramsRef.current.resonance = v[0]
    updateFilter()
    setUiUpdateTrigger((x) => x + 1)
  }
  const onDrive = (v: number[]) => {
    paramsRef.current.drive = v[0]
    const ac = acRef.current
    const w = workletRef.current
    if (ac && w) {
      w.parameters.get("drive")?.setTargetAtTime(v[0], ac.currentTime, 0.02)
      const pg = paramsRef.current.postGain + 0.1 * v[0]
      w.parameters.get("postGain")?.setTargetAtTime(pg, ac.currentTime, 0.02)
    }
    setUiUpdateTrigger((x) => x + 1)
  }
  const onResComp = (v: number[]) => {
    paramsRef.current.resComp = v[0]
    const ac = acRef.current
    const w = workletRef.current
    if (ac && w) w.parameters.get("resComp")?.setTargetAtTime(v[0], ac.currentTime, 0.02)
    setUiUpdateTrigger((x) => x + 1)
  }
  const onFbSat = (v: number[]) => {
    paramsRef.current.fbSat = v[0]
    const ac = acRef.current
    const w = workletRef.current
    if (ac && w) w.parameters.get("fbSat")?.setTargetAtTime(v[0], ac.currentTime, 0.02)
    setUiUpdateTrigger((x) => x + 1)
  }
  const onCvAmt = (v: number[]) => {
    paramsRef.current.cvAttenuation = v[0]
    updateFilter()
    setUiUpdateTrigger((x) => x + 1)
  }
  const onIn1 = (v: number[]) => { paramsRef.current.input1Level = v[0]; pushInputLevels(); setUiUpdateTrigger((x) => x + 1) }
  const onIn2 = (v: number[]) => { paramsRef.current.input2Level = v[0]; pushInputLevels(); setUiUpdateTrigger((x) => x + 1) }
  const onIn3 = (v: number[]) => { paramsRef.current.input3Level = v[0]; pushInputLevels(); setUiUpdateTrigger((x) => x + 1) }

  // ---- mount ---------------------------------------------------------------
  useEffect(() => {
    const ac = getAudioContext()
    acRef.current = ac
    let cancelled = false

    const setup = async () => {
      try { await ac.audioWorklet.addModule("/ladder-filter-processor.js") } catch {}
      if (cancelled) return

      // Inputs as ports (mono)
      in1Ref.current = ac.createGain(); setMono(in1Ref.current); in1Ref.current.gain.value = paramsRef.current.input1Level
      in2Ref.current = ac.createGain(); setMono(in2Ref.current); in2Ref.current.gain.value = paramsRef.current.input2Level
      in3Ref.current = ac.createGain(); setMono(in3Ref.current); in3Ref.current.gain.value = paramsRef.current.input3Level

      // Register inputs with new system (no type arg)
      registerAudioNode(`${moduleId}-audio-in-1`, in1Ref.current)
      registerAudioNode(`${moduleId}-audio-in-2`, in2Ref.current)
      registerAudioNode(`${moduleId}-audio-in-3`, in3Ref.current)

      // CV inputs (optional) + analysers for snapshots
      cutoffCVInRef.current = ac.createGain(); cutoffCVInRef.current.gain.value = 1
      resCVInRef.current = ac.createGain();    resCVInRef.current.gain.value = 1
      registerAudioNode(`${moduleId}-cutoff-cv-in`, cutoffCVInRef.current)
      registerAudioNode(`${moduleId}-resonance-cv-in`, resCVInRef.current)

      cutoffAnalyserRef.current = ac.createAnalyser()
      cutoffAnalyserRef.current.fftSize = 1024
      cutoffAnalyserRef.current.smoothingTimeConstant = 0.98
      cutoffCVInRef.current.connect(cutoffAnalyserRef.current)

      resAnalyserRef.current = ac.createAnalyser()
      resAnalyserRef.current.fftSize = 1024
      resAnalyserRef.current.smoothingTimeConstant = 0.98
      resCVInRef.current.connect(resAnalyserRef.current)

      // Mixer (mono)
      mixRef.current = ac.createGain(); setMono(mixRef.current); mixRef.current.gain.value = 1
      in1Ref.current.connect(mixRef.current)
      in2Ref.current.connect(mixRef.current)
      in3Ref.current.connect(mixRef.current)

      // Worklet
      const initCut = utils.mapExponential(paramsRef.current.cutoff, MIN_CUTOFF, MAX_CUTOFF)
      workletRef.current = new AudioWorkletNode(ac, "ladder-filter-processor", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
        channelInterpretation: "discrete",
        parameterData: {
          cutoff: initCut,
          resonance: paramsRef.current.resonance,
          drive: paramsRef.current.drive,
          postGain: paramsRef.current.postGain,
          // resComp: paramsRef.current.resComp,
          // fbSat: paramsRef.current.fbSat,
        },
      } as any)

      // Output (mono) + register as port
      outRef.current = ac.createGain(); setMono(outRef.current); outRef.current.gain.value = 1
      mixRef.current.connect(workletRef.current!)
      workletRef.current!.connect(outRef.current)
      registerAudioNode(`${moduleId}-audio-out`, outRef.current)

      // expose get/set if your host uses them
      const el = document.querySelector(`[data-module-id="${moduleId}"]`)
      if (el) { ;(el as any).getParameters = getParameters; (el as any).setParameters = setParameters }

      // Prime & start rAF loop
      updateCvSnapshot()
      updateFilter()
      pushInputLevels()
      rafRef.current = requestAnimationFrame(function loop() { tick(); })
    }

    setup()
    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      try {
        outRef.current?.disconnect()
        workletRef.current?.disconnect()
        mixRef.current?.disconnect()
        in1Ref.current?.disconnect()
        in2Ref.current?.disconnect()
        in3Ref.current?.disconnect()
        cutoffCVInRef.current?.disconnect()
        resCVInRef.current?.disconnect()
      } catch {}
    }
  }, [moduleId, registerAudioNode])

  // ---- UI -------------------------------------------------------------------
  return (
    <ModuleContainer title="Filter" moduleId={moduleId}>
      <div className="flex flex-col items-center justify-center gap-3">
        <Knob value={[paramsRef.current.cutoff]} onValueChange={onCutoff} size="lg" data-param="cutoff" label="Cutoff" />
        <div className="flex gap-4">
          <Knob value={[paramsRef.current.resonance]} onValueChange={onRes} size="md" data-param="resonance" label="Res" />
          <Knob value={[paramsRef.current.drive]} /* onValueChange={onDrive} */ size="md" data-param="drive" label="Drive" />
        </div>
        <div className="flex gap-2">
          <Knob value={[paramsRef.current.cvAttenuation]} onValueChange={onCvAmt} size="sm" data-param="cvAttenuation" label="CV Amt" />
          <Knob value={[paramsRef.current.resComp]} onValueChange={onResComp} size="sm" data-param="resComp" label="R Comp" />
          <Knob value={[paramsRef.current.fbSat]} /* onValueChange={onFbSat} */ size="sm" data-param="fbSat" label="FB Sat" />
        </div>
        <div className="flex gap-2">
          <Knob value={[paramsRef.current.input1Level]} onValueChange={onIn1} size="sm" data-param="input1Level" label="IN 1" />
          <Knob value={[paramsRef.current.input2Level]} onValueChange={onIn2} size="sm" data-param="input2Level" label="IN 2" />
          <Knob value={[paramsRef.current.input3Level]} onValueChange={onIn3} size="sm" data-param="input3Level" label="IN 3" />
        </div>
      </div>

      <div className="flex-grow" />

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end gap-2">
          <Port id={`${moduleId}-audio-in-1`} type="input" label="IN 1" audioType="audio" />
          <Port id={`${moduleId}-audio-in-2`} type="input" label="IN 2" audioType="audio" />
          <Port id={`${moduleId}-audio-in-3`} type="input" label="IN 3" audioType="audio" />
        </div>
        <div className="flex justify-between items-end gap-2">
          <Port id={`${moduleId}-cutoff-cv-in`} type="input" label="CUTOFF" audioType="cv" />
          <Port id={`${moduleId}-resonance-cv-in`} type="input" label="RES" audioType="cv" />
          <Port id={`${moduleId}-audio-out`} type="output" label="OUT" audioType="audio" />
        </div>
      </div>
    </ModuleContainer>
  )
}
