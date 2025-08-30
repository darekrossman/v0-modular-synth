"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { ModuleContainer } from "@/components/module-container"
import { Port } from "./port"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

export function KeyboardCVModule({ moduleId }: { moduleId: string }) {
  const [currentNote, setCurrentNote] = useState<string | null>(null)
  const [isGateActive, setIsGateActive] = useState(false)
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set())

  const audioContextRef = useRef<AudioContext | null>(null)
  const gateSourceRef = useRef<ConstantSourceNode | null>(null)
  const pitchOutputRef = useRef<ConstantSourceNode | null>(null)
  const gateGainRef = useRef<GainNode | null>(null)
  const pitchGainRef = useRef<GainNode | null>(null)
  const isInitializedRef = useRef(false)
  const keyStackRef = useRef<string[]>([])

  // Key mapping: AWSEDFTGYHUJ -> C, C#, D, D#, E, F, F#, G, G#, A, A#, B
  const keyToNote: { [key: string]: { note: string; semitone: number } } = {
    a: { note: "C", semitone: 0 },
    w: { note: "C#", semitone: 1 },
    s: { note: "D", semitone: 2 },
    e: { note: "D#", semitone: 3 },
    d: { note: "E", semitone: 4 },
    f: { note: "F", semitone: 5 },
    t: { note: "F#", semitone: 6 },
    g: { note: "G", semitone: 7 },
    y: { note: "G#", semitone: 8 },
    h: { note: "A", semitone: 9 },
    u: { note: "A#", semitone: 10 },
    j: { note: "B", semitone: 11 },
  }

  const calculateFrequency = useCallback((semitone: number) => {
    // C3 base frequency: 130.81 Hz
    const c3Frequency = 130.81
    return c3Frequency * Math.pow(2, semitone / 12)
  }, [])

  const updateToMostRecentKey = useCallback(() => {
    if (keyStackRef.current.length === 0) return

    const mostRecentKey = keyStackRef.current[keyStackRef.current.length - 1]
    const noteInfo = keyToNote[mostRecentKey]
    const frequency = calculateFrequency(noteInfo.semitone)

    setCurrentNote(noteInfo.note)

    if (audioContextRef.current && pitchOutputRef.current) {
      const pitchCV = -1 + noteInfo.semitone / 12
      pitchOutputRef.current.offset.setValueAtTime(pitchCV, audioContextRef.current.currentTime)

      console.log(
        "[v0] Keyboard CV: Updated to most recent key",
        mostRecentKey,
        "->",
        noteInfo.note,
        "->",
        frequency.toFixed(2),
        "Hz",
        "CV:",
        pitchCV.toFixed(3) + "V",
        "Stack:",
        JSON.stringify(keyStackRef.current),
      )
    }
  }, [calculateFrequency, keyToNote])

  const initAudioNodes = useCallback(() => {
    if (isInitializedRef.current) return
    // Set init guard BEFORE any potential async operations to prevent duplicate init
    isInitializedRef.current = true

    const audioContext = getAudioContext()
    audioContextRef.current = audioContext

    gateSourceRef.current = audioContext.createConstantSource()
    gateSourceRef.current.offset.value = 0

    gateGainRef.current = audioContext.createGain()
    gateGainRef.current.gain.value = 1

    gateSourceRef.current.connect(gateGainRef.current)
    gateSourceRef.current.start()

    pitchOutputRef.current = audioContext.createConstantSource()
    pitchOutputRef.current.offset.value = 0

    pitchGainRef.current = audioContext.createGain()
    pitchGainRef.current.gain.value = 1

    pitchOutputRef.current.connect(pitchGainRef.current)
    pitchOutputRef.current.start()

    console.log("[KEYBOARD-CV] initialized")
  }, [moduleId])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!keyToNote[key] || keyStackRef.current.includes(key)) return

      keyStackRef.current.push(key)
      setPressedKeys((prev) => new Set([...prev, key]))

      if (keyStackRef.current.length === 1) {
        setIsGateActive(true)
        if (gateSourceRef.current && audioContextRef.current) {
          gateSourceRef.current.offset.setValueAtTime(5, audioContextRef.current.currentTime)
          console.log("[v0] Keyboard CV: Gate ON - 5V")
        }
      }

      const noteInfo = keyToNote[key]
      const frequency = calculateFrequency(noteInfo.semitone)
      setCurrentNote(noteInfo.note)

      if (pitchOutputRef.current && audioContextRef.current) {
        const pitchCV = -1 + noteInfo.semitone / 12
        pitchOutputRef.current.offset.setValueAtTime(pitchCV, audioContextRef.current.currentTime)
        console.log("[v0] Keyboard CV: Key", key, "->", noteInfo.note, "->", pitchCV.toFixed(3) + "V")
      }
    },
    [calculateFrequency, keyToNote],
  )

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (!keyToNote[key] || !keyStackRef.current.includes(key)) return

      keyStackRef.current = keyStackRef.current.filter((k) => k !== key)
      setPressedKeys((prev) => {
        const newSet = new Set(prev)
        newSet.delete(key)
        return newSet
      })

      if (keyStackRef.current.length === 0) {
        setIsGateActive(false)
        setCurrentNote(null)
        if (gateSourceRef.current && audioContextRef.current) {
          gateSourceRef.current.offset.setValueAtTime(0, audioContextRef.current.currentTime)
          console.log("[v0] Keyboard CV: Gate OFF - 0V")
        }
      } else {
        updateToMostRecentKey()
      }
    },
    [updateToMostRecentKey],
  )

  useEffect(() => {
    initAudioNodes()
  }, [initAudioNodes])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [handleKeyDown, handleKeyUp])

  const PianoKeyboard = () => {
    const whiteKeys = ["a", "s", "d", "f", "g", "h", "j"] // C, D, E, F, G, A, B
    const blackKeys = [
      { key: "w", position: 0.65 }, // C# - between C and D
      { key: "e", position: 1.7 }, // D# - between D and E
      { key: "t", position: 3.7 }, // F# - between F and G
      { key: "y", position: 4.7 }, // G# - between G and A
      { key: "u", position: 5.72 }, // A# - between A and B
    ]

    const handlePianoKeyDown = (key: string) => {
      if (!keyToNote[key] || keyStackRef.current.includes(key)) return

      keyStackRef.current.push(key)
      setPressedKeys((prev) => new Set([...prev, key]))

      if (keyStackRef.current.length === 1) {
        setIsGateActive(true)
        if (gateSourceRef.current && audioContextRef.current) {
          gateSourceRef.current.offset.setValueAtTime(5, audioContextRef.current.currentTime)
          console.log("[v0] Keyboard CV: Piano Gate ON - 5V")
        }
      }

      const noteInfo = keyToNote[key]
      const frequency = calculateFrequency(noteInfo.semitone)
      setCurrentNote(noteInfo.note)

      if (pitchOutputRef.current && audioContextRef.current) {
        const pitchCV = -1 + noteInfo.semitone / 12
        pitchOutputRef.current.offset.setValueAtTime(pitchCV, audioContextRef.current.currentTime)
        console.log("[v0] Keyboard CV: Piano Key", key, "->", noteInfo.note, "->", pitchCV.toFixed(3) + "V")
      }
    }

    const handlePianoKeyUp = (key: string) => {
      if (!keyToNote[key] || !keyStackRef.current.includes(key)) return

      keyStackRef.current = keyStackRef.current.filter((k) => k !== key)
      setPressedKeys((prev) => {
        const newSet = new Set(prev)
        newSet.delete(key)
        return newSet
      })

      if (keyStackRef.current.length === 0) {
        setIsGateActive(false)
        setCurrentNote(null)
        if (gateSourceRef.current && audioContextRef.current) {
          gateSourceRef.current.offset.setValueAtTime(0, audioContextRef.current.currentTime)
          console.log("[v0] Keyboard CV: Piano Gate OFF - 0V")
        }
      } else {
        updateToMostRecentKey()
      }
    }

    return (
      <div>
        <div className="relative w-full h-12 mx-auto rounded-[2px] overflow-hidden">
          {/* White keys */}
          <div className="flex h-full">
            {whiteKeys.map((key, index) => (
              <div
                key={key}
                className={`flex-1 border-r border-black/30 last:border-r-0 cursor-pointer select-none ${
                  pressedKeys.has(key) ? "bg-blue-400 border-blue-400" : "bg-neutral-100 hover:bg-neutral-200"
                } transition-colors duration-75`}
                onMouseDown={() => handlePianoKeyDown(key)}
                onMouseUp={() => handlePianoKeyUp(key)}
                onMouseLeave={() => handlePianoKeyUp(key)}
              />
            ))}
          </div>

          <div className="absolute top-0 left-0 h-8 w-full flex pointer-events-none">
            {blackKeys.map(({ key, position }) => (
              <div
                key={key}
                className={`absolute h-full cursor-pointer select-none pointer-events-auto ${
                  pressedKeys.has(key) ? "bg-blue-400" : "bg-neutral-800 hover:bg-neutral-700"
                } transition-colors duration-75 border-gray-700`}
                style={{
                  left: `${(position * 100) / 7}%`,
                  width: `${(100 / 7) * 0.6}%`, // Make black keys 60% of white key width
                }}
                onMouseDown={() => handlePianoKeyDown(key)}
                onMouseUp={() => handlePianoKeyUp(key)}
                onMouseLeave={() => handlePianoKeyUp(key)}
              />
            ))}
          </div>
        </div>
        <div className="text-center mt-2">
          <div className="text-lg font-mono">{currentNote || "---"}</div>
        </div>
      </div>
    )
  }

  const ComputerKeyboard = () => {
    const topRowKeys = [
      { key: "W", note: "C#" },
      { key: "E", note: "D#" },
      { key: "R", note: "" },
      { key: "T", note: "F#" },
      { key: "Y", note: "G#" },
      { key: "U", note: "A#" },
    ]

    const bottomRowKeys = [
      { key: "A", note: "C" },
      { key: "S", note: "D" },
      { key: "D", note: "E" },
      { key: "F", note: "F" },
      { key: "G", note: "G" },
      { key: "H", note: "A" },
      { key: "J", note: "B" },
    ]

    return (
      <div>
        <div className="flex flex-col gap-[1px] items-center">
          {/* Top row - black keys/sharps */}
          <div className="flex gap-[1px]">
            {topRowKeys.map(({ key, note }) =>
              note ? (
                <div
                  key={key}
                  className={`w-4 h-4 rounded-[2px] flex items-center justify-center transition-colors duration-75 ${
                    pressedKeys.has(key.toLowerCase())
                      ? "bg-blue-500 border-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-100 shadow-sm"
                  }`}
                >
                  <span className="text-[9px] font-mono font-medium">{key}</span>
                </div>
              ) : (
                <div key={key} className="w-4 h-4" />
              ),
            )}
          </div>

          {/* Bottom row - white keys/naturals */}
          <div className="flex gap-[1px]">
            {bottomRowKeys.map(({ key, note }) => (
              <div
                key={key}
                className={`w-4 h-4 rounded-[2px] flex items-center justify-center transition-colors duration-75 ${
                  pressedKeys.has(key.toLowerCase())
                    ? "bg-blue-500 text-white"
                    : "bg-neutral-800 text-neutral-100 shadow-sm"
                }`}
              >
                <span className="text-[9px] font-mono font-medium">{key}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-black/50 mt-2 text-center">
          Play notes with
          <br />
          your keyboard
        </div>
      </div>
    )
  }

  return (
    <ModuleContainer title="Keyboard CV" moduleId={moduleId}>
      <div className="flex-1 flex flex-col justify-center items-center">
        <div className="w-full h-full flex-1 flex flex-col justify-center gap-12">
          <div className="">
            <PianoKeyboard />
          </div>
          <div className="">
            <ComputerKeyboard />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-end gap-1">
        <Port
          id={`${moduleId}-gate-out`}
          type="output"
          audioType="cv"
          label="Gate Out"
          audioNode={gateGainRef.current ?? undefined}
        />
        <Port
          id={`${moduleId}-pitch-out`}
          type="output"
          audioType="cv"
          label="CV Out"
          audioNode={pitchGainRef.current ?? undefined}
        />
      </div>
    </ModuleContainer>
  )
}
