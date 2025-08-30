"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ModuleContainer } from "./module-container"
import { Slider } from "@/components/ui/slider"
import { PushButton } from "@/components/ui/push-button"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { TextLabel } from "@/components/text-label"
import { Port } from "./port"
import { Knob } from "@/components/ui/knob"
import { mapLinear } from "@/lib/utils"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

// Ranges for mapping 0..1 -> seconds
const ATTACK_MIN = 0.001,
  ATTACK_MAX = 2.0
const DECAY_MIN = 0.001,
  DECAY_MAX = 2.0
const SUSTAIN_MIN = 0.0,
  SUSTAIN_MAX = 1.0
const RELEASE_MIN = 0.001,
  RELEASE_MAX = 5.0
const MAXV_MIN = 0.0,
  MAXV_MAX = 10.0

// Defaults (normalized 0..1) chosen to yield ~0.1s / 0.2s / 0.7 / 0.3s
const DEFAULT_ATTACK_N = (0.001 - ATTACK_MIN) / (ATTACK_MAX - ATTACK_MIN)
const DEFAULT_DECAY_N = (0.2 - DECAY_MIN) / (DECAY_MAX - DECAY_MIN)
const DEFAULT_SUSTAIN_N = 1
const DEFAULT_RELEASE_N = (0.1 - RELEASE_MIN) / (RELEASE_MAX - RELEASE_MIN) // ≈ 0.0598

export function ADSRModule({ moduleId }: { moduleId: string }) {
  // Normalized UI state (0..1 for each slider)
  const [attackN, setAttackN] = useState<number[]>([DEFAULT_ATTACK_N])
  const [decayN, setDecayN] = useState<number[]>([DEFAULT_DECAY_N])
  const [sustainN, setSustainN] = useState<number[]>([DEFAULT_SUSTAIN_N])
  const [releaseN, setReleaseN] = useState<number[]>([DEFAULT_RELEASE_N])
  const [maxVN, setMaxVN] = useState<number[]>([1])

  const [retrig, setRetrig] = useState(true)
  const [longMode, setLongMode] = useState(false)
  const [linearShape, setLinearShape] = useState(false)
  const [isTriggered, setIsTriggered] = useState(false)

  // Audio graph
  const audioContextRef = useRef<AudioContext | null>(null)
  const gateInputRef = useRef<GainNode | null>(null) // external gate jack (0..5V)
  const manualGateRef = useRef<ConstantSourceNode | null>(null) // local 0/5V gate for TRIG
  const envOutRef = useRef<GainNode | null>(null) // exposed ENV output
  const invOutRef = useRef<GainNode | null>(null) // exposed inverted ENV output
  const nodeRef = useRef<AudioWorkletNode | null>(null) // adsr-processor worklet
  const keepAliveRef = useRef<GainNode | null>(null)
  const isInitializedRef = useRef(false)

  // Helpers: map normalized slider values to real units
  const mapAttack = (n: number) => mapLinear(n, ATTACK_MIN, ATTACK_MAX)
  const mapDecay = (n: number) => mapLinear(n, DECAY_MIN, DECAY_MAX)
  const mapSustain = (n: number) => mapLinear(n, SUSTAIN_MIN, SUSTAIN_MAX)
  const mapRelease = (n: number) => mapLinear(n, RELEASE_MIN, RELEASE_MAX)
  const mapMaxV = (n: number) => mapLinear(n, MAXV_MIN, MAXV_MAX)

  // One-time init
  const initAudioNodes = useCallback(async () => {
    if (isInitializedRef.current) return
    const ac = getAudioContext()
    audioContextRef.current = ac

    await ac.audioWorklet.addModule("/adsr-processor.js")

    // IO nodes
    gateInputRef.current = ac.createGain()
    gateInputRef.current.gain.value = 1

    manualGateRef.current = ac.createConstantSource()
    manualGateRef.current.offset.setValueAtTime(0, ac.currentTime)
    manualGateRef.current.start()

    envOutRef.current = ac.createGain(); envOutRef.current.gain.value = 1
    invOutRef.current = ac.createGain(); invOutRef.current.gain.value = 1

    // Create worklet with initial (mapped) params
    const node = new AudioWorkletNode(ac, "adsr-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      parameterData: {
        attack: mapAttack(attackN[0]),
        decay: mapDecay(decayN[0]),
        sustain: mapSustain(sustainN[0]),
        release: mapRelease(releaseN[0]),
        retrig: retrig ? 1 : 0,
        long: longMode ? 1 : 0,
        shapeLinear: linearShape ? 1 : 0,
        hiThresh: 2.5,
        loThresh: 1.5,
        maxv: mapMaxV(maxVN[0]),
      },
    })
    nodeRef.current = node

    // Sum external + manual gates into input 0
    gateInputRef.current.connect(node)
    manualGateRef.current.connect(node)

    // Worklet → ENV jack
    node.connect(envOutRef.current, 0, 0)
    node.connect(invOutRef.current, 1, 0)

    // Keep-alive sink
    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    envOutRef.current.connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)

    isInitializedRef.current = true
    // eslint-disable-next-line no-console
    console.log("[ADSR] initialized (worklet + mapped params)")
  }, [moduleId])

  useEffect(() => {
    initAudioNodes()
    return () => {
      try {
        nodeRef.current?.disconnect()
        gateInputRef.current?.disconnect()
        manualGateRef.current?.disconnect()
        envOutRef.current?.disconnect()
        invOutRef.current?.disconnect()
        keepAliveRef.current?.disconnect()
      } catch { }
    }
  }, [initAudioNodes])

  // Push mapped values to AudioParams (timeline-accurate)
  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("attack")?.setValueAtTime(mapAttack(attackN[0]), ac.currentTime)
  }, [attackN])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("decay")?.setValueAtTime(mapDecay(decayN[0]), ac.currentTime)
  }, [decayN])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("sustain")?.setValueAtTime(mapSustain(sustainN[0]), ac.currentTime)
  }, [sustainN])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("release")?.setValueAtTime(mapRelease(releaseN[0]), ac.currentTime)
  }, [releaseN])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("maxv")?.setValueAtTime(mapMaxV(maxVN[0]), ac.currentTime)
  }, [maxVN])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("retrig")?.setValueAtTime(retrig ? 1 : 0, ac.currentTime)
  }, [retrig])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("long")?.setValueAtTime(longMode ? 1 : 0, ac.currentTime)
  }, [longMode])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = nodeRef.current
    if (ac && node) node.parameters.get("shapeLinear")?.setValueAtTime(linearShape ? 1 : 0, ac.currentTime)
  }, [linearShape])

  // Manual TRIG gate
  const handleMouseDown = () => {
    setIsTriggered(true)
    const ac = audioContextRef.current
    if (ac && manualGateRef.current) {
      manualGateRef.current.offset.setValueAtTime(5, ac.currentTime)
    }
  }
  const handleMouseUp = () => {
    setIsTriggered(false)
    const ac = audioContextRef.current
    if (ac && manualGateRef.current) {
      manualGateRef.current.offset.setValueAtTime(0, ac.currentTime)
    }
  }

  // Optional programmatic API (returns mapped/real values)
  const getParameters = () => ({
    attack: mapAttack(attackN[0]),
    decay: mapDecay(decayN[0]),
    sustain: mapSustain(sustainN[0]),
    release: mapRelease(releaseN[0]),
    retrig,
    longMode,
    linearShape,
    maxv: mapMaxV(maxVN[0]),
  })
  const setParameters = (p: Record<string, any>) => {
    if (p.attack !== undefined) setAttackN([(p.attack - ATTACK_MIN) / (ATTACK_MAX - ATTACK_MIN)])
    if (p.decay !== undefined) setDecayN([(p.decay - DECAY_MIN) / (DECAY_MAX - DECAY_MIN)])
    if (p.sustain !== undefined) setSustainN([(p.sustain - SUSTAIN_MIN) / (SUSTAIN_MAX - SUSTAIN_MIN)])
    if (p.release !== undefined) setReleaseN([(p.release - RELEASE_MIN) / (RELEASE_MAX - RELEASE_MIN)])
    if (p.retrig !== undefined) setRetrig(!!p.retrig)
    if (p.longMode !== undefined) setLongMode(!!p.longMode)
    if (p.linearShape !== undefined) setLinearShape(!!p.linearShape)
    if (p.maxv !== undefined) setMaxVN([(p.maxv - MAXV_MIN) / (MAXV_MAX - MAXV_MIN)])
  }

  useEffect(() => {
    const el = document.querySelector(`[data-module-id="${moduleId}"]`)
    if (el) {
      ; (el as any).getParameters = getParameters
        ; (el as any).setParameters = setParameters
    }
  }, [attackN, decayN, sustainN, releaseN, retrig, longMode, linearShape, maxVN, moduleId])

  return (
    <ModuleContainer moduleId={moduleId} title="ADSR">
      <div className="flex flex-col flex-1 gap-5">
        <div className="flex justify-center items-center gap-8 px-2 pt-2">
          <div className="flex flex-col items-center h-full gap-2">
            <div className="flex-1 flex items-center">
              <Slider
                value={attackN}
                onValueChange={setAttackN}
                min={0}
                max={1}
                step={0.001}
                orientation="vertical"
                className="h-32"
                data-param="attack"
              />
            </div>
            <TextLabel variant="control">A</TextLabel>
          </div>

          <div className="flex flex-col items-center h-full gap-2">
            <div className="flex-1 flex items-center">
              <Slider
                value={decayN}
                onValueChange={setDecayN}
                min={0}
                max={1}
                step={0.001}
                orientation="vertical"
                className="h-32"
                data-param="decay"
              />
            </div>
            <TextLabel variant="control">D</TextLabel>
          </div>

          <div className="flex flex-col items-center h-full gap-2">
            <div className="flex-1 flex items-center">
              <Slider
                value={sustainN}
                onValueChange={setSustainN}
                min={0}
                max={1}
                step={0.001}
                orientation="vertical"
                className="h-32"
                data-param="sustain"
              />
            </div>
            <TextLabel variant="control">S</TextLabel>
          </div>

          <div className="flex flex-col items-center h-full gap-2">
            <div className="flex-1 flex items-center">
              <Slider
                value={releaseN}
                onValueChange={setReleaseN}
                min={0}
                max={1}
                step={0.001}
                orientation="vertical"
                className="h-32"
                data-param="release"
              />
            </div>
            <TextLabel variant="control">R</TextLabel>
          </div>
        </div>

        <div className="flex flex-col justify-center items-center flex-1 gap-8">
          <div className="flex gap-4 items-center">
            <ToggleSwitch label="Retrig" value={retrig} onValueChange={setRetrig} />
            <ToggleSwitch label="Long" value={longMode} onValueChange={setLongMode} />
            <ToggleSwitch label="Linear" value={linearShape} onValueChange={setLinearShape} />
          </div>
          <div className="flex gap-6 items-center">
            <Knob size="sm" value={maxVN} onValueChange={setMaxVN} label="Lvl" />
            <PushButton
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              label="Trig"
              size="lg"
              feel="rubber"
            />
          </div>

        </div>

        <div className="flex justify-between items-end">
          <div className="flex gap-2">
            <Port
              id={`${moduleId}-gate-in`}
              type="input"
              label="Gate In"
              audioType="cv"
              audioNode={gateInputRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-inv-out`}
              type="output"
              label="INV OUT"
              audioType="cv"
              audioNode={invOutRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-env-out`}
              type="output"
              label="Env Out"
              audioType="cv"
              audioNode={envOutRef.current ?? undefined}
            />
          </div>
        </div>
      </div>
    </ModuleContainer>
  )
}
