"use client"

import { useRef, useCallback, useEffect, useState } from "react"
import { ModuleContainer } from "./module-container"
import { Knob } from "@/components/ui/knob"
import { Port } from "./port"
import { mapLinear } from "@/lib/utils"
import { useModuleInit } from "@/hooks/use-module-init"
import { useModulePatch } from "./patch-manager"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

export function VCAModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    cvAmount: cvAmount[0],
    offset: offset[0],
  }))

  // UI knobs are 0..1
  const [cvAmount, setCvAmount] = useState([initialParameters?.cvAmount ?? 1.0]) // 0..1 attenuator
  const [offset, setOffset] = useState([initialParameters?.offset ?? 0.0]) // 0..1 base gain

  const audioContextRef = useRef<AudioContext | null>(null)
  const audioInRef = useRef<GainNode | null>(null)
  const cvInRef = useRef<GainNode | null>(null)
  const cvAmtInRef = useRef<GainNode | null>(null)
  const vcaNodeRef = useRef<AudioWorkletNode | null>(null)
  const audioOutRef = useRef<GainNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)

  useModuleInit(async () => {
    if (vcaNodeRef.current) return // Already initialized

    const ac = getAudioContext()
    audioContextRef.current = ac

    await ac.audioWorklet.addModule("/vca-processor.js")

    audioInRef.current = ac.createGain()
    audioInRef.current.gain.value = 1

    cvInRef.current = ac.createGain()
    cvInRef.current.gain.value = 1 // treat 1.0 in buffer == 1 V in our CV domain

    cvAmtInRef.current = ac.createGain()
    cvAmtInRef.current.gain.value = 1

    audioOutRef.current = ac.createGain()
    audioOutRef.current.gain.value = 1

    const node = new AudioWorkletNode(ac, "vca-processor", {
      numberOfInputs: 3,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {
        offset: mapLinear(offset[0], 0, 1),
        cvAmount: mapLinear(cvAmount[0], 0, 1),
        slewMs: 1,
        dcBlock: 1,
        dcCutHz: 5,
        hardGateDb: -90,
        sat: 0.0,
      },
    })
    vcaNodeRef.current = node

    audioInRef.current.connect(node, 0, 0)
    cvInRef.current.connect(node, 0, 1)
    cvAmtInRef.current.connect(node, 0, 2)
    node.connect(audioOutRef.current)

    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    audioOutRef.current.connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)

    console.log("[VCA] initialized (linear, 10V=unity)")
  }, moduleId)

  useEffect(() => {
    const ac = audioContextRef.current,
      node = vcaNodeRef.current
    if (ac && node) node.parameters.get("cvAmount")?.setValueAtTime(mapLinear(cvAmount[0], 0, 1), ac.currentTime)
  }, [cvAmount])

  useEffect(() => {
    const ac = audioContextRef.current,
      node = vcaNodeRef.current
    if (ac && node) node.parameters.get("offset")?.setValueAtTime(mapLinear(offset[0], 0, 1), ac.currentTime)
  }, [offset])

  return (
    <ModuleContainer title="VCA" moduleId={moduleId} data-module-id={moduleId}>
      <div className="flex flex-col flex-1 justify-center items-center gap-6">
        <Knob value={cvAmount} onValueChange={setCvAmount} label="CV" />
        <Knob value={offset} onValueChange={setOffset} label="Offset" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-end gap-2">
          <Port
            id={`${moduleId}-cv-in`}
            type="input"
            label="CV"
            audioType="cv"
            audioNode={cvInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-cv-amt-in`}
            type="input"
            label="CV Amt"
            audioType="cv"
            audioNode={cvAmtInRef.current ?? undefined}
          />
        </div>
        <div className="flex justify-between items-end gap-2">
          <Port
            id={`${moduleId}-audio-in`}
            type="input"
            label="IN"
            audioType="audio"
            audioNode={audioInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-audio-out`}
            type="output"
            label="OUT"
            audioType="audio"
            audioNode={audioOutRef.current ?? undefined}
          />
        </div>
      </div>
    </ModuleContainer>
  )
}
