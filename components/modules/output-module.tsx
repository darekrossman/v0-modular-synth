'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Button } from '@/components/ui/button'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'
import { cn } from '@/lib/utils'

// Simple quality helpers
function makeDCBlocker(ctx: AudioContext, cutoffHz = 18) {
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = cutoffHz
  hp.Q.value = 0.707
  return hp
}
function makeSoftClipper(ctx: AudioContext) {
  const ws = ctx.createWaveShaper()
  const n = 1024,
    curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(1.5 * x)
  }
  ws.curve = curve
  ws.oversample = '2x'
  return ws
}

export function OutputModule({ moduleId }: { moduleId: string }) {
  // Register with patch manager and get initial parameters
  const { initialParameters } = useModulePatch(moduleId, () => ({
    volume,
  }))

  const [isPlaying, setIsPlaying] = useState(
    initialParameters?.isPlaying ?? false,
  )
  const [volume, setVolume] = useState(initialParameters?.volume ?? 0.75)

  // Meter DOM element refs (no React state for metering)
  const leftBarElRef = useRef<HTMLDivElement | null>(null)
  const rightBarElRef = useRef<HTMLDivElement | null>(null)
  const leftPeakElRef = useRef<HTMLDivElement | null>(null)
  const rightPeakElRef = useRef<HTMLDivElement | null>(null)
  const leftClipElRef = useRef<HTMLDivElement | null>(null)
  const rightClipElRef = useRef<HTMLDivElement | null>(null)

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

  // shadow refs to avoid setState spam
  const rmsLRef = useRef(0),
    rmsRRef = useRef(0)
  const peakLRef = useRef(0),
    peakRRef = useRef(0)
  const clipLDeadline = useRef(0),
    clipRDeadline = useRef(0)
  const clipLActiveRef = useRef(false)
  const clipRActiveRef = useRef(false)

  // UI smoothing/hold values (visual only)
  const dispRmsLRef = useRef(0)
  const dispRmsRRef = useRef(0)
  const holdLRef = useRef(0)
  const holdRRef = useRef(0)

  // Mapping: 0..1 knob → -48..0 dB → linear, then scaled
  const knobToGain = (v: number) => (v <= 0 ? 0 : 10 ** ((-48 + v * 48) / 20))
  const synthToLine = 0.25 // headroom

  useModuleInit(async () => {
    if (meterNodeRef.current || leftAnalyserRef.current) return // Already initialized

    const ac = getAudioContext()
    acRef.current = ac

    // Try to load meter worklet
    await ac.audioWorklet.addModule('/output-meter-processor.js')

    const leftIn = ac.createGain(),
      rightIn = ac.createGain()
    leftInRef.current = leftIn
    rightInRef.current = rightIn
    leftIn.gain.value = 1
    rightIn.gain.value = 1

    const leftTrim = ac.createGain(),
      rightTrim = ac.createGain()
    leftTrimRef.current = leftTrim
    rightTrimRef.current = rightTrim

    const leftDC = makeDCBlocker(ac, 18),
      rightDC = makeDCBlocker(ac, 18)
    leftDCRef.current = leftDC
    rightDCRef.current = rightDC

    const clipper = makeSoftClipper(ac)
    clipperRef.current = clipper

    const lim = ac.createDynamicsCompressor()
    lim.threshold.value = -1.0
    lim.knee.value = 12
    lim.ratio.value = 8
    lim.attack.value = 0.003
    lim.release.value = 0.05
    limiterRef.current = lim

    const meterMerger = ac.createChannelMerger(2)
    const outMerger = ac.createChannelMerger(2)
    meterMergerRef.current = meterMerger
    outMergerRef.current = outMerger

    const master = ac.createGain()
    master.gain.value = 0 // Start muted, will be controlled by start/stop functions
    masterGainRef.current = master

    // Meter path: worklet or analyser fallback
    if ((ac as any).audioWorklet && (AudioWorkletNode as any)) {
      try {
        const meter = new AudioWorkletNode(ac, 'output-meter', {
          numberOfInputs: 1,
          numberOfOutputs: 0,
          channelCount: 2,
          channelCountMode: 'explicit',
          channelInterpretation: 'speakers',
        })
        meter.port.onmessage = (e: MessageEvent) => {
          const data = e.data as Float32Array
          if (data && (data as any).length === 6) {
            // Smoothed values and holds come from worklet
            rmsLRef.current = data[0]
            rmsRRef.current = data[1]
            peakLRef.current = data[2]
            peakRRef.current = data[3]
            clipLActiveRef.current = data[4] >= 0.5
            clipRActiveRef.current = data[5] >= 0.5
          }
        }
        meterNodeRef.current = meter
        meterMerger.connect(meter)
      } catch {
        // analyser fallback
        const aL = ac.createAnalyser(),
          aR = ac.createAnalyser()
        aL.fftSize = 512
        aR.fftSize = 512
        aL.smoothingTimeConstant = 0.25
        aR.smoothingTimeConstant = 0.25
        leftAnalyserRef.current = aL
        rightAnalyserRef.current = aR
        f32L.current = new Float32Array(aL.fftSize)
        f32R.current = new Float32Array(aR.fftSize)
        // Create splitter to separate L/R channels for analysers
        const splitter = ac.createChannelSplitter(2)
        meterMerger.connect(splitter)
        splitter.connect(aL, 0, 0) // Left channel to left analyser
        splitter.connect(aR, 1, 0) // Right channel to right analyser
      }
    } else {
      const aL = ac.createAnalyser(),
        aR = ac.createAnalyser()
      aL.fftSize = 512
      aR.fftSize = 512
      aL.smoothingTimeConstant = 0.25
      aR.smoothingTimeConstant = 0.25
      leftAnalyserRef.current = aL
      rightAnalyserRef.current = aR
      f32L.current = new Float32Array(aL.fftSize)
      f32R.current = new Float32Array(aR.fftSize)
      // Create splitter to separate L/R channels for analysers
      const splitter = ac.createChannelSplitter(2)
      meterMerger.connect(splitter)
      splitter.connect(aL, 0, 0) // Left channel to left analyser
      splitter.connect(aR, 1, 0) // Right channel to right analyser
    }

    // Audio routing - set initial gain to current volume
    const initialGain = knobToGain(volume) * synthToLine // Use saved volume
    leftTrim.gain.setTargetAtTime(initialGain, ac.currentTime, 0.01)
    rightTrim.gain.setTargetAtTime(initialGain, ac.currentTime, 0.01)

    leftIn.connect(leftTrim)
    rightIn.connect(rightTrim)
    leftTrim.connect(leftDC)
    rightTrim.connect(rightDC)

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

    // Start meter loop after initialization completes
    rAF.current = requestAnimationFrame(meterLoop)
  }, moduleId)

  // console removed

  // Cleanup on unmount: stop RAF and detach meter port
  useEffect(() => {
    return () => {
      if (rAF.current != null) {
        cancelAnimationFrame(rAF.current)
        rAF.current = null
      }
      if (meterNodeRef.current) {
        try {
          meterNodeRef.current.port.onmessage = null
        } catch {}
      }
    }
  }, [])

  // Volume smoothing
  useEffect(() => {
    const ac = acRef.current,
      lt = leftTrimRef.current,
      rt = rightTrimRef.current
    if (!ac || !lt || !rt) return
    const g = knobToGain(volume) * synthToLine
    lt.gain.setTargetAtTime(g, ac.currentTime, 0.01)
    rt.gain.setTargetAtTime(g, ac.currentTime, 0.01)
  }, [volume, knobToGain, synthToLine])

  // Enable/disable
  const start = useCallback(() => {
    const ac = acRef.current ?? getAudioContext()
    acRef.current = ac
    if (ac.state === 'suspended') ac.resume()
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

  // rAF meter loop (30fps throttle, peak-hold decay, clip-LED latch) – DOM updates only
  const meterLoop = useCallback((ts: number) => {
    if (!lastMeterTs.current || ts - lastMeterTs.current > 33) {
      // Fallback analyser compute (RMS + peak + simple 2× inter-sample check)
      if (
        leftAnalyserRef.current &&
        rightAnalyserRef.current &&
        f32L.current &&
        f32R.current
      ) {
        const L = f32L.current,
          R = f32R.current
        leftAnalyserRef.current.getFloatTimeDomainData(L as any)
        rightAnalyserRef.current.getFloatTimeDomainData(R as any)
        let accL = 0,
          accR = 0,
          pL = 0,
          pR = 0
        let prevL = 0,
          prevR = 0
        const N = L.length
        for (let i = 0; i < N; i++) {
          const l = L[i],
            r = R[i]
          const midL = 0.5 * (prevL + l)
          const midR = 0.5 * (prevR + r)
          const aL = Math.max(Math.abs(l), Math.abs(midL))
          const aR = Math.max(Math.abs(r), Math.abs(midR))
          if (aL > pL) pL = aL
          if (aR > pR) pR = aR
          accL += l * l
          accR += r * r
          prevL = l
          prevR = r
        }
        rmsLRef.current = Math.sqrt(accL / N)
        rmsRRef.current = Math.sqrt(accR / N)
        peakLRef.current = pL
        peakRRef.current = pR
        const now = performance.now()
        const clipTh = 0.98
        if (pL >= clipTh) clipLDeadline.current = now + 750
        if (pR >= clipTh) clipRDeadline.current = now + 750
      }

      // Use worklet-smoothed values when available; apply fallback smoothing otherwise
      const workletActive = meterNodeRef.current != null
      if (workletActive) {
        dispRmsLRef.current = rmsLRef.current
        dispRmsRRef.current = rmsRRef.current
        holdLRef.current = peakLRef.current
        holdRRef.current = peakRRef.current
      } else {
        const smooth = (prev: number, next: number, a = 0.15) =>
          prev + (next - prev) * a

        dispRmsLRef.current = smooth(dispRmsLRef.current, rmsLRef.current)
        dispRmsRRef.current = smooth(dispRmsRRef.current, rmsRRef.current)

        const nextHoldL = Math.max(peakLRef.current, holdLRef.current - 0.015)
        const nextHoldR = Math.max(peakRRef.current, holdRRef.current - 0.015)
        if (Math.abs(nextHoldL - holdLRef.current) > 0.001)
          holdLRef.current = nextHoldL
        if (Math.abs(nextHoldR - holdRRef.current) > 0.001)
          holdRRef.current = nextHoldR
      }

      const now = performance.now()
      const clipActiveL = workletActive
        ? clipLActiveRef.current
        : now < clipLDeadline.current
      const clipActiveR = workletActive
        ? clipRActiveRef.current
        : now < clipRDeadline.current

      // Update left channel DOM
      const lBar = leftBarElRef.current
      const lPeak = leftPeakElRef.current
      const lClip = leftClipElRef.current
      if (lBar) {
        const level = Math.min(dispRmsLRef.current * 1.25, 1.25)
        lBar.style.transform = `scaleY(${level})`
        lBar.style.backgroundColor =
          dispRmsLRef.current > 0.9 ? '#ef4444' : '#22c55e'
      }
      if (lPeak) {
        const bottom = Math.min(holdLRef.current * 100, 125)
        lPeak.style.bottom = `calc(${bottom}% - 1px)`
      }
      if (lClip) {
        lClip.style.backgroundColor = clipActiveL ? '#ef4444' : '#404040'
      }

      // Update right channel DOM
      const rBar = rightBarElRef.current
      const rPeak = rightPeakElRef.current
      const rClip = rightClipElRef.current
      if (rBar) {
        const level = Math.min(dispRmsRRef.current * 1.25, 1.25)
        rBar.style.transform = `scaleY(${level})`
        rBar.style.backgroundColor =
          dispRmsRRef.current > 0.9 ? '#ef4444' : '#22c55e'
      }
      if (rPeak) {
        const bottom = Math.min(holdRRef.current * 100, 125)
        rPeak.style.bottom = `calc(${bottom}% - 1px)`
      }
      if (rClip) {
        rClip.style.backgroundColor = clipActiveR ? '#ef4444' : '#404040'
      }

      lastMeterTs.current = ts
    }
    rAF.current = requestAnimationFrame(meterLoop)
  }, [])

  return (
    <ModuleContainer title="Output" moduleId={moduleId}>
      <div className="flex-1 flex flex-col gap-4 mt-4">
        {/* VU meters with peak/clip indicators */}
        <div className="flex flex-1 justify-center gap-3 mb-2">
          {/* Left meter */}
          <div className="flex h-full flex-col items-center gap-1">
            <div className="relative w-5 h-full bg-black rounded-xs overflow-hidden">
              {/* 0 dB reference mark */}
              <div className="absolute top-[20%] left-0 right-0 h-0.5 bg-white/60 z-10" />
              {/* CLIP LED (latched) */}
              <div
                ref={leftClipElRef}
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                style={{ backgroundColor: '#404040' }}
              />
              {/* Peak-hold marker (thin line) */}
              <div
                ref={leftPeakElRef}
                className="absolute left-0 right-0 h-[2px] bg-yellow-300/90"
                style={{ bottom: '0%' }}
              />
              {/* RMS bar (transform-based for perf) */}
              <div
                ref={leftBarElRef}
                className="absolute bottom-0 left-0 right-0 h-full origin-bottom will-change-transform"
                style={{ transform: 'scaleY(0)', backgroundColor: '#22c55e' }}
              />
            </div>
            <div className="text-xs font-medium">L</div>
          </div>

          {/* Right meter */}
          <div className="flex h-full flex-col items-center gap-1">
            <div className="relative w-5 h-full bg-black rounded-xs overflow-hidden">
              {/* 0 dB reference mark */}
              <div className="absolute top-[20%] left-0 right-0 h-0.5 bg-white/60 z-10" />
              {/* CLIP LED (latched) */}
              <div
                ref={rightClipElRef}
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                style={{ backgroundColor: '#404040' }}
              />
              {/* Peak-hold marker (thin line) */}
              <div
                ref={rightPeakElRef}
                className="absolute left-0 right-0 h-[2px] bg-yellow-300/90"
                style={{ bottom: '0%' }}
              />
              {/* RMS bar (transform-based for perf) */}
              <div
                ref={rightBarElRef}
                className="absolute bottom-0 left-0 right-0 h-full origin-bottom will-change-transform"
                style={{ transform: 'scaleY(0)', backgroundColor: '#22c55e' }}
              />
            </div>
            <div className="text-xs font-medium">R</div>
          </div>
        </div>

        {/* Volume */}
        <div className="flex justify-center mb-8">
          <Knob
            value={[volume]}
            onValueChange={(v) => setVolume(v[0])}
            label="Volume"
            size="md"
          />
        </div>

        {/* Enable/Disable */}
        <div className="flex justify-center px-2">
          <Button
            onClick={() => (isPlaying ? stop() : start())}
            size="xs"
            className={cn('w-full', {
              'bg-green-500': !isPlaying,
              'bg-red-500': isPlaying,
            })}
          >
            {isPlaying ? 'Disable' : 'Enable'}
          </Button>
        </div>

        <PortGroup>
          <Port
            id={`${moduleId}-left-in`}
            type="input"
            label="L"
            audioType="audio"
            audioNode={leftInRef.current ?? undefined}
          />
          <Port
            id={`${moduleId}-right-in`}
            type="input"
            label="R"
            audioType="audio"
            audioNode={rightInRef.current ?? undefined}
          />
        </PortGroup>
      </div>
    </ModuleContainer>
  )
}
