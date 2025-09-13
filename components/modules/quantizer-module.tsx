'use client'

import { useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { TextLabel } from '../text-label'
import { Toggle } from '../ui/toggle'

// Scale masks (12-bit, LSB=C)
// Bit positions: B A# A G# G F# F E D# D C# C (reading right to left)
const SCALES: { id: string; name: string; mask: number }[] = [
  { id: 'chromatic', name: 'Chroma', mask: 0b111111111111 }, // All notes
  { id: 'major', name: 'Major', mask: 0b101010110101 }, // C D E F G A B
  { id: 'natural-minor', name: 'Nat Min', mask: 0b101101011010 }, // C D Eb F G Ab Bb
  { id: 'harmonic-minor', name: 'Harm Min', mask: 0b101101011001 }, // C D Eb F G Ab B
  { id: 'pentatonic-major', name: 'Penta Maj', mask: 0b101001010001 }, // C D E G A
  { id: 'pentatonic-minor', name: 'Penta Min', mask: 0b100101001010 }, // C Eb F G Bb
  { id: 'dorian', name: 'Dorian', mask: 0b101011011010 }, // C D Eb F G A Bb
  { id: 'mixolydian', name: 'Mixo', mask: 0b101010110110 }, // C D E F G A Bb
]

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function QuantizerModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    scaleId,
    keyIdx,
    hold,
    transpose,
    octave,
    mask12,
  }))

  const [scaleId, setScaleId] = useState<string>(
    initialParameters?.scaleId ?? 'major',
  )
  const [keyIdx, setKeyIdx] = useState<number>(initialParameters?.keyIdx ?? 0)
  const [hold, setHold] = useState<boolean>(initialParameters?.hold ?? false)
  const [transpose, setTranspose] = useState<number>(
    initialParameters?.transpose ?? 0,
  ) // semitones -12..+12
  const [octave, setOctave] = useState<number>(initialParameters?.octave ?? 0) // octaves -4..+4
  const [mask12, setMask12] = useState<number>(
    initialParameters?.mask12 ??
      SCALES.find((s) => s.id === (initialParameters?.scaleId ?? 'major'))
        ?.mask ??
      0xfff,
  )

  const acRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const pitchInRef = useRef<GainNode | null>(null)
  const trigInRef = useRef<GainNode | null>(null)
  const pitchOutRef = useRef<GainNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)

  useModuleInit(async () => {
    if (nodeRef.current) return
    const ac = getAudioContext()
    acRef.current = ac
    await ac.audioWorklet.addModule('/quantizer-processor.js')

    pitchInRef.current = ac.createGain()
    pitchInRef.current.gain.value = 1
    trigInRef.current = ac.createGain()
    trigInRef.current.gain.value = 1
    pitchOutRef.current = ac.createGain()
    pitchOutRef.current.gain.value = 1

    const node = new AudioWorkletNode(ac, 'quantizer-processor', {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
    })
    nodeRef.current = node

    pitchInRef.current.connect(node, 0, 0)
    trigInRef.current.connect(node, 0, 1)
    node.connect(pitchOutRef.current)

    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    pitchOutRef.current.connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)

    // Set initial params from saved state
    const t = ac.currentTime
    node.parameters.get('key')?.setValueAtTime(keyIdx, t)
    node.parameters.get('hold')?.setValueAtTime(hold ? 1 : 0, t)
    const total = Math.max(-96, Math.min(96, transpose + octave * 12))
    node.parameters.get('transpose')?.setValueAtTime(total, t)
    node.port.postMessage({ type: 'scale', mask12: mask12 })

    console.log('[QUANTIZER] initialized')
  }, moduleId)

  useEffect(() => {
    const ac = acRef.current,
      node = nodeRef.current
    if (!ac || !node) return
    node.parameters.get('key')?.setTargetAtTime(keyIdx, ac.currentTime, 0.01)
  }, [keyIdx])

  useEffect(() => {
    const ac = acRef.current,
      node = nodeRef.current
    if (!ac || !node) return
    node.parameters
      .get('hold')
      ?.setTargetAtTime(hold ? 1 : 0, ac.currentTime, 0.01)
  }, [hold])

  useEffect(() => {
    const ac = acRef.current,
      node = nodeRef.current
    if (!ac || !node) return
    const total = Math.max(-96, Math.min(96, transpose + octave * 12))
    node.parameters
      .get('transpose')
      ?.setTargetAtTime(total, ac.currentTime, 0.01)
  }, [transpose, octave])

  useEffect(() => {
    const node = nodeRef.current
    if (!node) return
    const scale = SCALES.find((s) => s.id === scaleId) || SCALES[0]
    const targetMask = mask12 ?? scale.mask
    node.port.postMessage({ type: 'scale', mask12: targetMask })
  }, [scaleId, mask12])

  // Helper to get the transposed mask for display
  const displayMask = (() => {
    const m = mask12 & 0xfff
    const k = ((keyIdx % 12) + 12) % 12
    return ((m << k) | (m >>> (12 - k))) & 0xfff
  })()

  return (
    <ModuleContainer moduleId={moduleId} title="Quantizer">
      <div className="flex flex-col justify-between gap-3 flex-1 mt-4">
        <div className="flex flex-col gap-3">
          <Select
            value={scaleId}
            onValueChange={(newScaleId) => {
              setScaleId(newScaleId)
              const scale = SCALES.find((s) => s.id === newScaleId)
              if (scale) {
                setMask12(scale.mask)
              }
            }}
          >
            <SelectGroup>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Scale" />
              </SelectTrigger>
              <SelectContent side="top">
                {SCALES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectGroup>
          </Select>
          <Select
            value={String(keyIdx)}
            onValueChange={(v) => setKeyIdx(Number(v))}
          >
            <SelectGroup>
              <SelectLabel>key</SelectLabel>
              <SelectTrigger className="w-14 uppercase">
                <SelectValue placeholder="Key" />
              </SelectTrigger>
              <SelectContent side="top">
                {KEYS.map((k, i) => (
                  <SelectItem key={k} value={String(i)} className="uppercase">
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectGroup>
          </Select>
        </div>

        <div className="relative h-12 rounded-[2px] overflow-hidden light:shadow-[0_0_0_1px_rgba(0,0,0,0.9)]">
          <div className="flex h-full">
            {/* White keys: C, D, E, F, G, A, B */}
            {([0, 2, 4, 5, 7, 9, 11] as number[]).map((semitone) => {
              const on = ((displayMask >> semitone) & 1) === 1
              return (
                <div
                  key={semitone}
                  className="relative w-4 flex-1 border-r border-black/30 last:border-r-0 cursor-pointer select-none bg-neutral-100 hover:bg-neutral-200"
                  onClick={() => {
                    // Toggle the note in the original mask (before transposition)
                    const noteInOriginalScale = (semitone - keyIdx + 12) % 12
                    setMask12((prev) => {
                      const nm = prev ^ (1 << noteInOriginalScale)
                      nodeRef.current?.port.postMessage({
                        type: 'scale',
                        mask12: nm & 0xfff,
                      })
                      return nm
                    })
                  }}
                >
                  {on && (
                    <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  )}
                </div>
              )
            })}
          </div>
          <div className="absolute top-0 left-0 h-8 w-full pointer-events-none">
            {/* Black keys: C#, D#, F#, G#, A# */}
            {(
              [
                { semitone: 1, pos: 0.65 }, // C#
                { semitone: 3, pos: 1.7 }, // D#
                { semitone: 6, pos: 3.7 }, // F#
                { semitone: 8, pos: 4.7 }, // G#
                { semitone: 10, pos: 5.72 }, // A#
              ] as { semitone: number; pos: number }[]
            ).map(({ semitone, pos }) => {
              const on = ((displayMask >> semitone) & 1) === 1
              return (
                <div
                  key={semitone}
                  className="absolute h-full pointer-events-auto cursor-pointer rounded-b-[2px] bg-neutral-800 hover:bg-neutral-700"
                  style={{
                    left: `${(pos * 100) / 7}%`,
                    width: `${(100 / 7) * 0.6}%`,
                  }}
                  onClick={() => {
                    // Toggle the note in the original mask (before transposition)
                    const noteInOriginalScale = (semitone - keyIdx + 12) % 12
                    setMask12((prev) => {
                      const nm = prev ^ (1 << noteInOriginalScale)
                      nodeRef.current?.port.postMessage({
                        type: 'scale',
                        mask12: nm & 0xfff,
                      })
                      return nm
                    })
                  }}
                >
                  {on && (
                    <div className="absolute bottom-[3px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="relative">
          <Toggle
            pressed={hold}
            size="sm"
            variant="push"
            onClick={() => setHold(!hold)}
          />
          <TextLabel variant="control" className="">
            HOLD
          </TextLabel>
        </div>

        <div className="flex items-center gap-5 pr-1">
          <Knob
            value={[(transpose + 12) / 24]}
            onValueChange={(v) => setTranspose(Math.round(v[0] * 24 - 12))}
            size="sm"
            label="Trans"
            tickLabels={['-12', '-6', '0', '+6', '+12']}
          />
          <Knob
            value={[(octave + 4) / 8]}
            onValueChange={(v) => setOctave(Math.round(v[0] * 8 - 4))}
            size="sm"
            label="Oct"
            tickLabels={['-4', '-2', '0', '+2', '+4']}
          />
        </div>

        <div className="flex items-center justify-between">
          <Port
            id={`${moduleId}-pitch-in`}
            type="input"
            label="cv"
            audioType="cv"
            audioNode={pitchInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-trig-in`}
            type="input"
            label="TRIG"
            audioType="gate"
            audioNode={trigInRef.current ?? undefined}
          />
          <PortGroup>
            <Port
              id={`${moduleId}-pitch-out`}
              type="output"
              label="OUT"
              audioType="cv"
              audioNode={pitchOutRef.current ?? undefined}
            />
          </PortGroup>
        </div>
      </div>
    </ModuleContainer>
  )
}
