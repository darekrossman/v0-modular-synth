"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { ModuleContainer } from "./module-container"
import { Button } from "@/components/ui/button"
import { Knob } from "@/components/ui/knob"
import { Port } from "./port"

// Shared AudioContext helper
function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

// Simple quality helpers
function makeDCBlocker(ctx: AudioContext, cutoffHz = 18) {
  const hp = ctx.createBiquadFilter()
  hp.type = "highpass"
  hp.frequency.value = cutoffHz
  hp.Q.value = 0.707
  return hp
}
function makeSoftClipper(ctx: AudioContext) {
  const ws = ctx.createWaveShaper()
  const n = 1024, curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(1.5 * x)
  }
  ws.curve = curve
  ws.oversample = "2x"
  return ws
}

export function OutputModule({ moduleId }: { moduleId: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.75)

  // RMS bars (0..1.2 for headroom)
  const [leftLevel, setLeftLevel] = useState(0)
  const [rightLevel, setRightLevel] = useState(0)

  // Peak-hold markers (0..1)
  const [leftPeakHold, setLeftPeakHold] = useState(0)
  const [rightPeakHold, setRightPeakHold] = useState(0)

  // Clip LEDs (latched)
  const [leftClipLED, setLeftClipLED] = useState(false)
  const [rightClipLED, setRightClipLED] = useState(false)

  // Audio graph
  const acRef = useRef<AudioContext | null>(null)
  const leftInRef = useRef<GainNode | null>(null)
  const rightInRef = useRef<GainNode | null>(null)
  const leftTrimRef = useRef<GainNode | null>(null)
  const rightTrimRef = useRef<GainNode | null>(null)
  const leftDCRef = useRef<BiquadFilterNode | null>(null)
  const rightDCRef = useRef<BiquadFilterNode | null>(null)
  const meterMergerRef = useRef<ChannelMergerNode | null>(null)
  const outMergerRef = useRef<ChannelMergerNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const limiterRef = useRef<DynamicsCompressorNode | null>(null)
  const clipperRef = useRef<WaveShaperNode | null>(null)

  // Metering
  const meterNodeRef = useRef<AudioWorkletNode | null>(null)
  const leftAnalyserRef = useRef<AnalyserNode | null>(null)
  const rightAnalyserRef = useRef<AnalyserNode | null>(null)
  const f32L = useRef<Float32Array | null>(null)
  const f32R = useRef<Float32Array | null>(null)
  const rAF = useRef<number | null>(null)
  const lastMeterTs = useRef(0)
  const [nodesReadyTick, setNodesReadyTick] = useState(0)

  // shadow refs to avoid setState spam
  const rmsLRef = useRef(0), rmsRRef = useRef(0)
  const peakLRef = useRef(0), peakRRef = useRef(0)
  const clipLDeadline = useRef(0), clipRDeadline = useRef(0)

  // Mapping: 0..1 knob → -48..0 dB → linear, then scaled
  const knobToGain = useCallback((v: number) => (v <= 0 ? 0 : Math.pow(10, (-48 + v * 48) / 20)), [])
  const synthToLine = 0.25 // headroom

  const initGraph = useCallback(async () => {
    if (acRef.current && leftInRef.current && rightInRef.current) return
    const ac = getAudioContext()
    acRef.current = ac

    // Try to load meter worklet
    try { await ac.audioWorklet.addModule("/output-meter-processor.js") } catch {}

    const leftIn = ac.createGain(), rightIn = ac.createGain()
    leftInRef.current = leftIn; rightInRef.current = rightIn
    leftIn.gain.value = 1; rightIn.gain.value = 1

    const leftTrim = ac.createGain(), rightTrim = ac.createGain()
    leftTrimRef.current = leftTrim; rightTrimRef.current = rightTrim

    const leftDC = makeDCBlocker(ac, 18), rightDC = makeDCBlocker(ac, 18)
    leftDCRef.current = leftDC; rightDCRef.current = rightDC

    const clipper = makeSoftClipper(ac); clipperRef.current = clipper

    const lim = ac.createDynamicsCompressor()
    lim.threshold.value = -1.0; lim.knee.value = 12; lim.ratio.value = 8
    lim.attack.value = 0.003; lim.release.value = 0.050
    limiterRef.current = lim

    const meterMerger = ac.createChannelMerger(2)
    const outMerger = ac.createChannelMerger(2)
    meterMergerRef.current = meterMerger
    outMergerRef.current = outMerger

    const master = ac.createGain()
    master.gain.value = isPlaying ? 1 : 0
    masterGainRef.current = master

    // Meter path: worklet or analyser fallback
    if ((ac as any).audioWorklet && (AudioWorkletNode as any)) {
      try {
        const meter = new AudioWorkletNode(ac, "output-meter", {
          numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2,
          channelCountMode: "explicit", channelInterpretation: "speakers",
        })
        meter.port.onmessage = (e: MessageEvent) => {
          const { lRMS, rRMS, lPeak, rPeak, lClip, rClip } = e.data as {
            lRMS: number; rRMS: number; lPeak: number; rPeak: number; lClip: boolean; rClip: boolean
          }
          rmsLRef.current = lRMS; rmsRRef.current = rRMS
          peakLRef.current = lPeak; peakRRef.current = rPeak
          const now = performance.now()
          if (lClip) clipLDeadline.current = now + 750 // 750ms latch
          if (rClip) clipRDeadline.current = now + 750
        }
        meterNodeRef.current = meter
        meterMerger.connect(meter)
      } catch {
        // analyser fallback
        const aL = ac.createAnalyser(), aR = ac.createAnalyser()
        aL.fftSize = 512; aR.fftSize = 512
        aL.smoothingTimeConstant = 0.25; aR.smoothingTimeConstant = 0.25
        leftAnalyserRef.current = aL; rightAnalyserRef.current = aR
        f32L.current = new Float32Array(aL.fftSize)
        f32R.current = new Float32Array(aR.fftSize)
        meterMerger.connect(aL, 0, 0); meterMerger.connect(aR, 0, 0)
      }
    } else {
      const aL = ac.createAnalyser(), aR = ac.createAnalyser()
      aL.fftSize = 512; aR.fftSize = 512
      aL.smoothingTimeConstant = 0.25; aR.smoothingTimeConstant = 0.25
      leftAnalyserRef.current = aL; rightAnalyserRef.current = aR
      f32L.current = new Float32Array(aL.fftSize)
      f32R.current = new Float32Array(aR.fftSize)
      meterMerger.connect(aL, 0, 0); meterMerger.connect(aR, 0, 0)
    }

    // Audio routing
    const applyTrim = () => {
      const g = knobToGain(volume) * synthToLine
      leftTrim.gain.setTargetAtTime(g, ac.currentTime, 0.01)
      rightTrim.gain.setTargetAtTime(g, ac.currentTime, 0.01)
    }
    applyTrim()

    leftIn.connect(leftTrim); rightIn.connect(rightTrim)
    leftTrim.connect(leftDC); rightTrim.connect(rightDC)

    // tee to meter
    leftDC.connect(meterMerger, 0, 0)
    rightDC.connect(meterMerger, 0, 1)

    // to output
    leftDC.connect(outMerger, 0, 0)
    rightDC.connect(outMerger, 0, 1)
    outMerger.connect(clipper)
    clipper.connect(lim)
    lim.connect(master)
    master.connect(ac.destination)

    setNodesReadyTick(t => t + 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, volume, knobToGain])

  // Volume smoothing
  useEffect(() => {
    const ac = acRef.current, lt = leftTrimRef.current, rt = rightTrimRef.current
    if (!ac || !lt || !rt) return
    const g = knobToGain(volume) * synthToLine
    lt.gain.setTargetAtTime(g, ac.currentTime, 0.01)
    rt.gain.setTargetAtTime(g, ac.currentTime, 0.01)
  }, [volume, knobToGain, synthToLine])

  // Enable/disable
  const start = useCallback(() => {
    const ac = acRef.current ?? getAudioContext()
    acRef.current = ac
    if (ac.state === "suspended") ac.resume()
    if (!masterGainRef.current) return
    const t = ac.currentTime
    masterGainRef.current.gain.cancelScheduledValues(t)
    masterGainRef.current.gain.linearRampToValueAtTime(1, t + 0.02)
    setIsPlaying(true)
  }, [])
  const stop = useCallback(() => {
    const ac = acRef.current
    if (!ac || !masterGainRef.current) return
    const t = ac.currentTime
    masterGainRef.current.gain.cancelScheduledValues(t)
    masterGainRef.current.gain.linearRampToValueAtTime(0, t + 0.02)
    setIsPlaying(false)
  }, [])
  const toggle = () => (isPlaying ? stop() : start())

  // rAF meter loop (30fps throttle, peak-hold decay, clip-LED latch)
  const meterLoop = useCallback((ts: number) => {
    if (!lastMeterTs.current || ts - lastMeterTs.current > 33) {
      // Fallback analyser compute (RMS + peak + simple 2× inter-sample check)
      if (leftAnalyserRef.current && rightAnalyserRef.current && f32L.current && f32R.current) {
        const L = f32L.current, R = f32R.current
        leftAnalyserRef.current.getFloatTimeDomainData(L)
        rightAnalyserRef.current.getFloatTimeDomainData(R)
        let accL = 0, accR = 0, pL = 0, pR = 0
        let prevL = 0, prevR = 0
        const N = L.length
        for (let i = 0; i < N; i++) {
          const l = L[i], r = R[i]
          const midL = 0.5 * (prevL + l)
          const midR = 0.5 * (prevR + r)
          const aL = Math.max(Math.abs(l), Math.abs(midL))
          const aR = Math.max(Math.abs(r), Math.abs(midR))
          if (aL > pL) pL = aL
          if (aR > pR) pR = aR
          accL += l * l; accR += r * r
          prevL = l; prevR = r
        }
        rmsLRef.current = Math.sqrt(accL / N)
        rmsRRef.current = Math.sqrt(accR / N)
        peakLRef.current = pL; peakRRef.current = pR
        const now = performance.now()
        const clipTh = 0.98
        if (pL >= clipTh) clipLDeadline.current = now + 750
        if (pR >= clipTh) clipRDeadline.current = now + 750
      }

      // Smooth UI updates + holds
      const smooth = (prev: number, next: number, a = 0.15) => prev + (next - prev) * a

      setLeftLevel(prev => smooth(prev, rmsLRef.current))
      setRightLevel(prev => smooth(prev, rmsRRef.current))

      setLeftPeakHold(prev => {
        const target = peakLRef.current
        const decayed = Math.max(target, prev - 0.015) // slow fall
        return Math.abs(decayed - prev) > 0.005 ? decayed : prev
      })
      setRightPeakHold(prev => {
        const target = peakRRef.current
        const decayed = Math.max(target, prev - 0.015)
        return Math.abs(decayed - prev) > 0.005 ? decayed : prev
      })

      const now = performance.now()
      setLeftClipLED(now < clipLDeadline.current)
      setRightClipLED(now < clipRDeadline.current)

      lastMeterTs.current = ts
    }
    rAF.current = requestAnimationFrame(meterLoop)
  }, [])

  // init + cleanup
  useEffect(() => {
    initGraph()
    rAF.current = requestAnimationFrame(meterLoop)
    return () => {
      if (rAF.current) cancelAnimationFrame(rAF.current)
      try {
        masterGainRef.current?.disconnect()
        limiterRef.current?.disconnect()
        clipperRef.current?.disconnect()
        outMergerRef.current?.disconnect()
        meterMergerRef.current?.disconnect()
        leftInRef.current?.disconnect()
        rightInRef.current?.disconnect()
        leftTrimRef.current?.disconnect()
        rightTrimRef.current?.disconnect()
        leftDCRef.current?.disconnect()
        rightDCRef.current?.disconnect()
        if (meterNodeRef.current?.port) (meterNodeRef.current.port.onmessage as any) = null
        meterNodeRef.current?.disconnect()
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getLevelColor = (level: number) => (level > 0.9 ? "bg-red-500" : "bg-green-500")

  return (
    <ModuleContainer title="Output" moduleId={moduleId}>
      <div className="flex-1 flex flex-col gap-4 p-4">
        {/* VU meters with peak/clip indicators */}
        <div className="flex flex-1 justify-center gap-6 mb-2">
          {([
            { label: "L", level: leftLevel, peak: leftPeakHold, clip: leftClipLED },
            { label: "R", level: rightLevel, peak: rightPeakHold, clip: rightClipLED },
          ] as const).map(({ label, level, peak, clip }) => (
            <div key={label} className="flex h-full flex-col items-center gap-1">
              <div className="relative w-5 h-full bg-black rounded-xs overflow-hidden flex flex-col-reverse">
                {/* 0 dB reference mark */}
                <div className="absolute top-[20%] left-0 right-0 h-0.5 bg-white/60 z-10" />
                {/* CLIP LED (latched) */}
                <div className={`absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${clip ? "bg-red-500" : "bg-neutral-700"}`} />
                {/* Peak-hold marker (thin line) */}
                <div
                  className="absolute left-0 right-0 h-[2px] bg-yellow-300/90"
                  style={{ bottom: `calc(${Math.min(peak * 100, 125)}% - 1px)` }}
                />
                {/* RMS bar */}
                <div
                  className={`w-full transition-all duration-75 ${getLevelColor(level)}`}
                  style={{ height: `${Math.min(level * 100, 125)}%` }}
                />
              </div>
              <div className="text-xs font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Volume */}
        <div className="flex justify-center mb-8">
          <Knob value={[volume]} onValueChange={(v) => setVolume(v[0])} label="Volume" size="lg" />
        </div>

        {/* Enable/Disable */}
        <div className="flex justify-center mb-12">
          <Button
            onClick={() => (isPlaying ? stop() : start())}
            size="md"
            className={`w-[110px] py-2 text-xs font-semibold ${!isPlaying ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {isPlaying ? "Disable Audio" : "Enable Audio"}
          </Button>
        </div>

        {/* Ports – pass nodes so the connection layer can bind */}
        <div className="flex justify-center items-end gap-8">
          <Port
            key={`L-${nodesReadyTick}`}
            id={`${moduleId}-left-in`}
            type="input"
            label="L"
            audioType="audio"
            audioNode={leftInRef.current ?? undefined}
          />
          <Port
            key={`R-${nodesReadyTick}`}
            id={`${moduleId}-right-in`}
            type="input"
            label="R"
            audioType="audio"
            audioNode={rightInRef.current ?? undefined}
          />
        </div>
      </div>
    </ModuleContainer>
  )
}
