"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ModuleContainer } from "./module-container"
import { Port } from "./port"
import { ToggleSwitch } from "@/components/ui/toggle-switch"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Knob } from "@/components/ui/knob"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

// Scale masks (12-bit, LSB=C)
const SCALES: { id: string; name: string; mask: number }[] = [
  { id: "chromatic", name: "Chromatic", mask: 0b111111111111 },
  { id: "major", name: "Major", mask: parseInt("101011010101", 2) }, // C D E F G A B
  { id: "natural-minor", name: "Natural Minor", mask: parseInt("101101011010", 2) }, // C D Eb F G Ab Bb
  { id: "harmonic-minor", name: "Harmonic Minor", mask: parseInt("101101011001", 2) },
  { id: "pentatonic-major", name: "Pentatonic Maj", mask: parseInt("100101010010", 2) }, // C D E G A
  { id: "pentatonic-minor", name: "Pentatonic Min", mask: parseInt("101001001010", 2) }, // C Eb F G Bb
  { id: "dorian", name: "Dorian", mask: parseInt("101101010110", 2) },
  { id: "mixolydian", name: "Mixolydian", mask: parseInt("101011010110", 2) },
]

const KEYS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"]

export function QuantizerModule({ moduleId }: { moduleId: string }) {
  const [scaleId, setScaleId] = useState<string>("major")
  const [keyIdx, setKeyIdx] = useState<number>(0)
  const [hold, setHold] = useState<boolean>(false)
  const [transpose, setTranspose] = useState<number>(0) // semitones -12..+12
  const [octave, setOctave] = useState<number>(0) // octaves -4..+4
  const [mask12, setMask12] = useState<number>(() => (SCALES.find(s => s.id === "major")?.mask ?? 0xFFF))

  const acRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const pitchInRef = useRef<GainNode | null>(null)
  const trigInRef = useRef<GainNode | null>(null)
  const pitchOutRef = useRef<GainNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)
  const initRef = useRef(false)

  const init = useCallback(async () => {
    if (initRef.current) return
    initRef.current = true
    const ac = getAudioContext(); acRef.current = ac
    await ac.audioWorklet.addModule("/quantizer-processor.js")

    pitchInRef.current = ac.createGain(); pitchInRef.current.gain.value = 1
    trigInRef.current = ac.createGain(); trigInRef.current.gain.value = 1
    pitchOutRef.current = ac.createGain(); pitchOutRef.current.gain.value = 1

    const node = new AudioWorkletNode(ac, "quantizer-processor", {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    })
    nodeRef.current = node

    pitchInRef.current.connect(node, 0, 0)
    trigInRef.current.connect(node, 0, 1)
    node.connect(pitchOutRef.current)

    keepAliveRef.current = ac.createGain(); keepAliveRef.current.gain.value = 0
    pitchOutRef.current.connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)

    // Initial params (defaults)
    const t = ac.currentTime
    node.parameters.get("key")?.setValueAtTime(0, t)
    node.parameters.get("hold")?.setValueAtTime(0, t)
    node.parameters.get("transpose")?.setValueAtTime(0, t)
    const scale = SCALES.find(s => s.id === "major") || SCALES[0]
    setMask12(scale.mask)
    node.port.postMessage({ type: 'scale', mask12: scale.mask })
  }, [])

  useEffect(() => {
    init()
    return () => {
      try { nodeRef.current?.disconnect() } catch {}
      try { pitchInRef.current?.disconnect() } catch {}
      try { trigInRef.current?.disconnect() } catch {}
      try { pitchOutRef.current?.disconnect() } catch {}
      try { keepAliveRef.current?.disconnect() } catch {}
    }
  }, [])

  useEffect(() => {
    const ac = acRef.current, node = nodeRef.current
    if (!ac || !node) return
    node.parameters.get("key")?.setTargetAtTime(keyIdx, ac.currentTime, 0.01)
  }, [keyIdx])

  useEffect(() => {
    const ac = acRef.current, node = nodeRef.current
    if (!ac || !node) return
    node.parameters.get("hold")?.setTargetAtTime(hold ? 1 : 0, ac.currentTime, 0.01)
  }, [hold])

  useEffect(() => {
    const ac = acRef.current, node = nodeRef.current
    if (!ac || !node) return
    const total = Math.max(-96, Math.min(96, transpose + octave * 12))
    node.parameters.get("transpose")?.setTargetAtTime(total, ac.currentTime, 0.01)
  }, [transpose, octave])

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return
    const scale = SCALES.find(s => s.id === scaleId) || SCALES[0]
    const targetMask = mask12 ?? scale.mask
    node.port.postMessage({ type: 'scale', mask12: targetMask })
  }, [scaleId, mask12])

  // Helpers for preview
  const rotatedMask = (() => {
    const m = (mask12 & 0xFFF)
    const k = ((keyIdx % 12) + 12) % 12
    return ((m << k) | (m >>> (12 - k))) & 0xFFF
  })()
  const keysRotated = Array.from({ length: 12 }, (_, i) => KEYS[(i + keyIdx) % 12])

  return (
    <ModuleContainer moduleId={moduleId} title="Quantizer">
      <div className="flex flex-col gap-3">
        {/* Row 1: Inputs left, controls center, output right */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Port id={`${moduleId}-pitch-in`} type="input" label="PITCH" audioType="cv" audioNode={pitchInRef.current ?? undefined} />
            <Port id={`${moduleId}-trig-in`} type="input" label="TRIG" audioType="cv" audioNode={trigInRef.current ?? undefined} />
          </div>
          <div className="flex items-center gap-4">
            <ToggleSwitch label="Trig Only" value={hold} onValueChange={setHold} />
            <Knob
              value={[ (transpose + 12) / 24 ]}
              onValueChange={(v) => setTranspose(Math.round(v[0] * 24 - 12))}
              size="sm"
              label="Trans"
              tickLabels={["-12","-6","0","+6","+12"]}
            />
            <Knob
              value={[ (octave + 4) / 8 ]}
              onValueChange={(v) => setOctave(Math.round(v[0] * 8 - 4))}
              size="sm"
              label="Oct"
              tickLabels={["-4","-2","0","+2","+4"]}
            />
          </div>
          <div className="flex items-center gap-3">
            <Port id={`${moduleId}-pitch-out`} type="output" label="OUT" audioType="cv" audioNode={pitchOutRef.current ?? undefined} />
          </div>
        </div>

        {/* Row 2: Scale/Key selectors only */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Select value={scaleId} onValueChange={setScaleId}>
              <SelectTrigger className="w-36 h-8"><SelectValue placeholder="Scale" /></SelectTrigger>
              <SelectContent>
                {SCALES.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(keyIdx)} onValueChange={(v) => setKeyIdx(Number(v))}>
              <SelectTrigger className="w-20 h-8"><SelectValue placeholder="Key" /></SelectTrigger>
              <SelectContent>
                {KEYS.map((k, i) => <SelectItem key={k} value={String(i)}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div />
        </div>

        {/* Row 3: Piano-style scale editor (full width right-aligned) */}
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-3">
            <div className="relative w-64 h-10 rounded-[2px] overflow-hidden">
              <div className="flex h-full">
                {([0,2,4,5,7,9,11] as number[]).map((rotSemi) => {
                  const on = ((rotatedMask >> rotSemi) & 1) === 1
                  const isRoot = rotSemi === 0
                  return (
                    <div
                      key={rotSemi}
                      className={`flex-1 border-r border-black/30 last:border-r-0 cursor-pointer select-none ${
                        on ? (isRoot ? 'bg-green-300' : 'bg-blue-300') : 'bg-neutral-100 hover:bg-neutral-200'
                      }`}
                      onClick={() => {
                        const baseIdx = (rotSemi - keyIdx + 12) % 12
                        setMask12((prev) => {
                          const nm = prev ^ (1 << baseIdx)
                          nodeRef.current?.port.postMessage({ type: 'scale', mask12: nm & 0xFFF })
                          return nm
                        })
                      }}
                    />
                  )
                })}
              </div>
              <div className="absolute top-0 left-0 h-6 w-full pointer-events-none">
                {([
                  { rotSemi:1, pos:0.65 },
                  { rotSemi:3, pos:1.7 },
                  { rotSemi:6, pos:3.7 },
                  { rotSemi:8, pos:4.7 },
                  { rotSemi:10, pos:5.72 },
                ] as {rotSemi:number; pos:number}[]).map(({rotSemi, pos}) => {
                  const on = ((rotatedMask >> rotSemi) & 1) === 1
                  const isRoot = rotSemi === 0
                  return (
                    <div
                      key={rotSemi}
                      className={`absolute h-full pointer-events-auto cursor-pointer rounded-[2px] border ${
                        on ? (isRoot ? 'bg-green-500 border-green-600' : 'bg-blue-500 border-blue-600') : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700'
                      }`}
                      style={{ left: `${(pos * 100) / 7}%`, width: `${(100 / 7) * 0.6}%` }}
                      onClick={() => {
                        const baseIdx = (rotSemi - keyIdx + 12) % 12
                        setMask12((prev) => {
                          const nm = prev ^ (1 << baseIdx)
                          nodeRef.current?.port.postMessage({ type: 'scale', mask12: nm & 0xFFF })
                          return nm
                        })
                      }}
                    />
                  )
                })}
              </div>
            </div>
            <Button size="xs" onClick={() => {
              const scale = SCALES.find(s => s.id === scaleId) || SCALES[0]
              setMask12(scale.mask)
              nodeRef.current?.port.postMessage({ type: 'scale', mask12: scale.mask })
            }}>Reset</Button>
          </div>
        </div>
      </div>
    </ModuleContainer>
  )
}
