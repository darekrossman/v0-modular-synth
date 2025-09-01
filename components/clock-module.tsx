"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { ModuleContainer } from "./module-container"
import { Knob } from "@/components/ui/knob"
import { PushButton } from "@/components/ui/push-button"
import { Port } from "./port"
import { mapLinear } from "@/lib/utils"
import { useModuleInit } from "@/hooks/use-module-init"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

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

    await ac.audioWorklet.addModule("/clock-processor.js")

    const node = new AudioWorkletNode(ac, "clock-processor", {
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

    node.port.postMessage({ type: "running", value: false })
    console.log("[clock] initialized")
  }, moduleId)

  const startClock = useCallback(() => {
    const node = nodeRef.current
    if (!node) return
    node.port.postMessage({ type: "reset" })
    node.port.postMessage({ type: "running", value: true })
  }, [])

  const stopClock = useCallback(() => {
    const node = nodeRef.current
    if (!node) return
    node.port.postMessage({ type: "running", value: false })
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
    const next = Math.max(0.1, mapLinear(raw01, 0, 300))
    setBpm([next])
    const ac = audioContextRef.current
    const node = nodeRef.current
    if (ac && node) node.parameters.get("bpm")?.setValueAtTime(next, ac.currentTime)
  }, [])

  // Selector labels and handlers
  const divisionLabels = ["1/32", "1/16", "1/8", "1/4", "1/2", "1/1", "2/1", "4/1", "8/1"]
  const SEL_COUNT = divisionLabels.length

  const makeDivHandler = (paramName: string, setState: (v: number[]) => void) => (value: number[]) => {
    const v01 = value[0] ?? 0
    const idx = Math.round(v01 * (SEL_COUNT - 1)) // 0..8
    setState([v01])
    const ac = audioContextRef.current
    const node = nodeRef.current
    if (ac && node) node.parameters.get(paramName)?.setValueAtTime(idx, ac.currentTime)
  }

  const handleDiv1Change = useCallback(makeDivHandler("div1", setDiv1), [])
  const handleDiv2Change = useCallback(makeDivHandler("div2", setDiv2), [])
  const handleDiv3Change = useCallback(makeDivHandler("div3", setDiv3), [])
  const handleDiv4Change = useCallback(makeDivHandler("div4", setDiv4), [])

  const defaultKnobValue = [120 / 300]

  return (
    <ModuleContainer title="Clock" moduleId={moduleId}>
      <div className="flex flex-col items-center gap-6 w-full">
        <div className="bg-black text-red-400 font-mono text-md py-1 rounded-xs w-full text-center">
          {bpm[0].toFixed(1)} BPM
        </div>

        <div className="flex-1 flex justify-center items-center gap-4">
          <div className="w-15 flex justify-center">
            <PushButton
              onClick={handleStartStop}
              className={`${isRunning
                ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                : "bg-green-600 hover:bg-green-700 active:bg-green-800"
                }`}
              label={isRunning ? "Stop" : "Run"}
            />
          </div>
          <Knob
            defaultValue={defaultKnobValue}
            onValueChange={handleKnobChange}
            label="Tempo"
            size="md"
            className="text-black"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-5">
        <div className="flex items-center gap-6">
          <div className="flex justify-center w-15"><Knob
            defaultValue={[3 / 8]}
            onValueChange={handleDiv1Change}
            label="DIV1"
            size="sm"
            tickLabels={divisionLabels}
            steps={9}
          /></div>
          <Port
            id={`${moduleId}-div1-out`}
            type="output"
            label="DIV1"
            audioType="cv"
            audioNode={div1OutRef.current ?? undefined}
          />
        </div>

        <div className="flex items-center gap-6">
          <div className="flex justify-center w-15"><Knob
            defaultValue={[4 / 8]}
            onValueChange={handleDiv2Change}
            label="DIV2"
            size="sm"
            tickLabels={divisionLabels}
            steps={9}
          /></div>
          <Port
            id={`${moduleId}-div2-out`}
            type="output"
            label="DIV2"
            audioType="cv"
            audioNode={div2OutRef.current ?? undefined}
          />
        </div>

        <div className="flex items-center gap-6">
          <div className="flex justify-center w-15"><Knob
            defaultValue={[5 / 8]}
            onValueChange={handleDiv3Change}
            label="DIV3"
            size="sm"
            tickLabels={divisionLabels}
            steps={9}
          /></div>
          <Port
            id={`${moduleId}-div3-out`}
            type="output"
            label="DIV3"
            audioType="cv"
            audioNode={div3OutRef.current ?? undefined}
          />
        </div>

        <div className="flex items-center gap-6">
          <div className="flex justify-center w-15"><Knob
            defaultValue={[6 / 8]}
            onValueChange={handleDiv4Change}
            label="DIV4"
            size="sm"
            tickLabels={divisionLabels}
            steps={9}
          /></div>
          <Port
            id={`${moduleId}-div4-out`}
            type="output"
            label="DIV4"
            audioType="cv"
            audioNode={div4OutRef.current ?? undefined}
          />
        </div>
      </div>

      <div className="flex-grow" />

      <div className="flex justify-center gap-4">
        <Port
          id={`${moduleId}-48ppq-out`}
          type="output"
          label="48PPQ"
          audioType="cv"
          audioNode={ppq48OutRef.current ?? undefined}
        />
      </div>
    </ModuleContainer>
  )
}
