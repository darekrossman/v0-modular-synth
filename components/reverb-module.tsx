"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { ModuleContainer } from "./module-container"
import { Knob } from "@/components/ui/knob"
import { Port } from "./port"
import { useConnections } from "./connection-manager"

export function ReverbModule({ moduleId }: { moduleId: string }) {
  const [roomSize, setRoomSize] = useState([0.5]) // 0.1 to 1.0
  const [decayTime, setDecayTime] = useState([2.0]) // 0.1 to 10.0 seconds
  const [damping, setDamping] = useState([0.5]) // 0.0 to 1.0
  const [dryWet, setDryWet] = useState([0.3]) // 0.0 (dry) to 1.0 (wet)

  const audioContextRef = useRef<AudioContext | null>(null)
  const audioInputRef = useRef<GainNode | null>(null)
  const outputRef = useRef<GainNode | null>(null)
  const dryGainRef = useRef<GainNode | null>(null)
  const wetGainRef = useRef<GainNode | null>(null)

  // Delay-based reverb nodes
  const delayNodesRef = useRef<DelayNode[]>([])
  const feedbackGainsRef = useRef<GainNode[]>([])
  const dampingFiltersRef = useRef<BiquadFilterNode[]>([])

  const isInitializedRef = useRef(false)

  const { registerAudioNode, getAudioContext } = useConnections()

  const getParameters = () => ({
    roomSize: roomSize[0],
    decayTime: decayTime[0],
    damping: damping[0],
    dryWet: dryWet[0],
  })

  const setParameters = (params: Record<string, any>) => {
    if (params.roomSize !== undefined) setRoomSize([params.roomSize])
    if (params.decayTime !== undefined) setDecayTime([params.decayTime])
    if (params.damping !== undefined) setDamping([params.damping])
    if (params.dryWet !== undefined) setDryWet([params.dryWet])
  }

  useEffect(() => {
    const moduleElement = document.querySelector(`[data-module-id="${moduleId}"]`)
    if (moduleElement) {
      ;(moduleElement as any).getParameters = getParameters
      ;(moduleElement as any).setParameters = setParameters
    }
  }, [roomSize, decayTime, damping, dryWet])

  const updateReverbParameters = useCallback(() => {
    if (!audioContextRef.current || delayNodesRef.current.length === 0) return

    const currentTime = audioContextRef.current.currentTime

    // Update delay times based on room size
    const baseDelayTimes = [0.03, 0.05, 0.07, 0.11, 0.13, 0.17] // Prime numbers for natural sound
    delayNodesRef.current.forEach((delay, index) => {
      const delayTime = baseDelayTimes[index] * roomSize[0]
      delay.delayTime.setTargetAtTime(delayTime, currentTime, 0.01)
    })

    // Update feedback gains based on decay time
    const feedbackAmount = Math.min(0.95, decayTime[0] / 10.0) // Scale decay time to feedback
    feedbackGainsRef.current.forEach((gain) => {
      gain.gain.setTargetAtTime(feedbackAmount, currentTime, 0.01)
    })

    // Update damping filters
    const dampingFreq = 20000 * (1 - damping[0]) // Higher damping = lower cutoff
    dampingFiltersRef.current.forEach((filter) => {
      filter.frequency.setTargetAtTime(dampingFreq, currentTime, 0.01)
    })

    // Update dry/wet mix
    if (dryGainRef.current && wetGainRef.current) {
      const dryAmount = 1 - dryWet[0]
      const wetAmount = dryWet[0]
      dryGainRef.current.gain.setTargetAtTime(dryAmount, currentTime, 0.01)
      wetGainRef.current.gain.setTargetAtTime(wetAmount, currentTime, 0.01)
    }

    console.log(
      `[v0] Reverb: Updated room=${roomSize[0].toFixed(2)}, decay=${decayTime[0].toFixed(1)}s, damping=${damping[0].toFixed(2)}, mix=${dryWet[0].toFixed(2)}`,
    )
  }, [roomSize, decayTime, damping, dryWet])

  const initAudioNodes = useCallback(() => {
    if (isInitializedRef.current) return

    const audioContext = getAudioContext()
    audioContextRef.current = audioContext

    // Audio input
    audioInputRef.current = audioContext.createGain()
    audioInputRef.current.gain.setValueAtTime(1, audioContext.currentTime)
    registerAudioNode(moduleId, `${moduleId}-audio-in`, audioInputRef.current, "input")

    // Dry/wet mixer
    dryGainRef.current = audioContext.createGain()
    wetGainRef.current = audioContext.createGain()

    // Output mixer
    outputRef.current = audioContext.createGain()
    outputRef.current.gain.setValueAtTime(1, audioContext.currentTime)
    registerAudioNode(moduleId, `${moduleId}-audio-out`, outputRef.current, "output")

    // Create delay-based reverb network (Schroeder reverb)
    const delayTimes = [0.03, 0.05, 0.07, 0.11, 0.13, 0.17] // Prime-based delay times
    const reverbMixer = audioContext.createGain()
    reverbMixer.gain.setValueAtTime(0.3, audioContext.currentTime)

    delayTimes.forEach((baseTime, index) => {
      // Create delay line
      const delay = audioContext.createDelay(1.0)
      delay.delayTime.setValueAtTime(baseTime * roomSize[0], audioContext.currentTime)
      delayNodesRef.current.push(delay)

      // Create feedback gain
      const feedbackGain = audioContext.createGain()
      feedbackGain.gain.setValueAtTime(0.6, audioContext.currentTime)
      feedbackGainsRef.current.push(feedbackGain)

      // Create damping filter
      const dampingFilter = audioContext.createBiquadFilter()
      dampingFilter.type = "lowpass"
      dampingFilter.frequency.setValueAtTime(8000, audioContext.currentTime)
      dampingFilter.Q.setValueAtTime(0.7, audioContext.currentTime)
      dampingFiltersRef.current.push(dampingFilter)

      // Connect delay line: input -> delay -> damping -> feedback -> delay (loop)
      audioInputRef.current!.connect(delay)
      delay.connect(dampingFilter)
      dampingFilter.connect(feedbackGain)
      feedbackGain.connect(delay) // Feedback loop

      // Send to reverb mixer
      dampingFilter.connect(reverbMixer)
    })

    // Connect dry signal
    audioInputRef.current.connect(dryGainRef.current)
    dryGainRef.current.connect(outputRef.current)

    // Connect wet signal
    reverbMixer.connect(wetGainRef.current)
    wetGainRef.current.connect(outputRef.current)

    // Set initial parameters
    updateReverbParameters()

    isInitializedRef.current = true
    console.log("[v0] Reverb: Initialized delay-based reverb with 6 delay lines")
  }, [registerAudioNode, moduleId, getAudioContext, roomSize, updateReverbParameters])

  useEffect(() => {
    if (isInitializedRef.current) {
      updateReverbParameters()
    }
  }, [roomSize, decayTime, damping, dryWet, updateReverbParameters])

  useEffect(() => {
    initAudioNodes()
  }, [initAudioNodes])

  return (
    <ModuleContainer title="Reverb" moduleId={moduleId}>
      <div className="grid grid-cols-2 gap-4 flex-1 items-center justify-center">
        <Knob
          value={roomSize}
          onValueChange={setRoomSize}
          min={0.1}
          max={1.0}
          step={0.01}
          size="md"
          data-param="roomSize"
          label="Room"
        />
        <Knob
          value={decayTime}
          onValueChange={setDecayTime}
          min={0.1}
          max={10.0}
          step={0.1}
          size="md"
          data-param="decayTime"
          label="Decay"
        />
        <Knob
          value={damping}
          onValueChange={setDamping}
          min={0.0}
          max={1.0}
          step={0.01}
          size="md"
          data-param="damping"
          label="Damping"
        />
        <Knob
          value={dryWet}
          onValueChange={setDryWet}
          min={0.0}
          max={1.0}
          step={0.01}
          size="md"
          data-param="dryWet"
          label="Dry/Wet"
        />
      </div>

      <div className="flex-grow"></div>

      <div className="flex justify-between items-end gap-1">
        <Port id={`${moduleId}-audio-in`} type="input" label="IN" audioType="audio" />
        <Port id={`${moduleId}-audio-out`} type="output" label="OUT" audioType="audio" />
      </div>
    </ModuleContainer>
  )
}
