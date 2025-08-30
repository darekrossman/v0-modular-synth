"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { ModuleContainer } from "./module-container"
import { Knob } from "@/components/ui/knob"
import { Button } from "@/components/ui/button"
import { Port } from "./port"
import { mapLinear } from "@/lib/utils"

function getAudioContext(): AudioContext {
  const w = window as any
  if (!w.__ac) w.__ac = new (window.AudioContext || (window as any).webkitAudioContext)()
  if (w.__ac.state === "suspended") w.__ac.resume()
  return w.__ac as AudioContext
}

export function SimpleOscilloscopeModule({ moduleId }: { moduleId: string }) {
  // Minimal state for controls only
  const [timeDiv, setTimeDiv] = useState([0.2]) // 0..1 -> 5ms..2s
  const [voltsIndex, setVoltsIndex] = useState([4]) // 0..4 => 0.25,0.5,1,2,5
  const [triggerEnabled, setTriggerEnabled] = useState(true)
  const [triggerLevelNorm, setTriggerLevelNorm] = useState([0.5]) // normalized 0..1 to -scale..+scale

  const voltsOptions = [0.25, 0.5, 1, 2, 5]

  // Audio nodes
  const acRef = useRef<AudioContext | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const inputRef = useRef<GainNode | null>(null)
  const pullRef = useRef<GainNode | null>(null)
  const framePendingRef = useRef<boolean>(false)
  const isInitializedRef = useRef<boolean>(false)

  // Canvas and data
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const samplesLineRef = useRef<Float32Array | null>(null)
  const samplesMinRef = useRef<Float32Array | null>(null)
  const samplesMaxRef = useRef<Float32Array | null>(null)
  const drawRef = useRef<() => void>(() => { })

  const ensureCanvasSize = useCallback(() => {
    const c = canvasRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    const displayW = Math.max(100, Math.floor(rect.width))
    const displayH = Math.max(80, Math.floor(rect.height))
    const backingW = displayW * dpr
    const backingH = displayH * dpr
    if (c.width !== backingW || c.height !== backingH) {
      c.width = backingW
      c.height = backingH
      // Inform worklet of new column count in CSS pixels
      workletRef.current?.port.postMessage({ type: "config", outPixels: displayW })
    }
  }, [])

  // Initialize audio + worklet once (guarded)
  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true
    const ac = getAudioContext()
    acRef.current = ac
      ; (async () => {
        try {
          await ac.audioWorklet.addModule("/simple-oscilloscope-processor.js")
          const input = ac.createGain(); input.gain.value = 1
          const node = new AudioWorkletNode(ac, "simple-oscilloscope-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [1],
            channelCount: 1,
            channelCountMode: "explicit",
            channelInterpretation: "speakers",
          })
          input.connect(node)
          // Keep processor pulled by routing to silent gain -> destination
          const pull = ac.createGain(); pull.gain.value = 0
          node.connect(pull)
          pull.connect(ac.destination)
          workletRef.current = node
          inputRef.current = input
          pullRef.current = pull

          node.port.onmessage = (e) => {
            const d = e.data || {}
            if (d.type === "frame") {
              if (d.samplesMin && d.samplesMax) {
                samplesMinRef.current = new Float32Array(d.samplesMin)
                samplesMaxRef.current = new Float32Array(d.samplesMax)
                samplesLineRef.current = null
              } else if (d.samples) {
                // Back-compat fallback to averaged line
                samplesLineRef.current = new Float32Array(d.samples)
                samplesMinRef.current = null
                samplesMaxRef.current = null
              }
              // Schedule a draw on the next animation frame for smoother pacing
              if (!framePendingRef.current) {
                framePendingRef.current = true
                requestAnimationFrame(() => { framePendingRef.current = false; drawRef.current() })
              }
            }
          }

          // Initial visual config; parameters set below (use CSS pixels, not backing store)
          {
            const c = canvasRef.current
            const rectW = c ? Math.max(100, Math.floor(c.getBoundingClientRect().width)) : 400
            node.port.postMessage({ type: "config", outPixels: rectW })
          }
          const t = ac.currentTime
          const winSec = mapLinear(timeDiv[0], 0.001, 2)
          node.parameters.get("windowSec")?.setValueAtTime(winSec, t)
          node.parameters.get("triggerEnabled")?.setValueAtTime(triggerEnabled ? 1 : 0, t)
          node.parameters.get("triggerLevel")?.setValueAtTime(0, t)
          // Default to AUTO behavior when trigger is enabled
          node.parameters.get("autoMode")?.setValueAtTime(1, t)
        } catch (err) {
          console.error("[SimpleScope] init error", err)
        }
      })()

    return () => {
      try { workletRef.current?.disconnect() } catch { }
      try { inputRef.current?.disconnect() } catch { }
      try { pullRef.current?.disconnect() } catch { }
      workletRef.current = null
      inputRef.current = null
      pullRef.current = null
    }
  }, [])

  // Push control changes to worklet via parameters
  useEffect(() => {
    const node = workletRef.current
    const c = canvasRef.current
    if (!node || !c) return
    const windowSec = mapLinear(timeDiv[0], 0.001, 2)
    const voltsPerDiv = voltsOptions[voltsIndex[0]] || 1
    const fullScaleVolts = voltsPerDiv * 5 // 5 divisions up/down
    const trigLevel = mapLinear(triggerLevelNorm[0], -fullScaleVolts, fullScaleVolts)
    const now = acRef.current?.currentTime ?? 0
    node.parameters.get("windowSec")?.setTargetAtTime(windowSec, now, 0.01)
    node.parameters.get("triggerEnabled")?.setTargetAtTime(triggerEnabled ? 1 : 0, now, 0.01)
    node.parameters.get("triggerLevel")?.setTargetAtTime(trigLevel, now, 0.01)
    // Keep AUTO on by default; easy to change to NORM later if needed
    node.parameters.get("autoMode")?.setTargetAtTime(1, now, 0.01)
    // Keep pixel width synced only on resize handler
  }, [timeDiv, voltsIndex, triggerEnabled, triggerLevelNorm])

  // Draw grid and trace
  const draw = useCallback(() => {
    const c = canvasRef.current
    const lineData = samplesLineRef.current
    if (!c) return
    const ctx = c.getContext("2d"); if (!ctx) return
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
    // Draw using CSS pixel coordinates for crisp text; scale context by DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const w = c.width / dpr
    const h = c.height / dpr
    const voltsPerDiv = voltsOptions[voltsIndex[0]] || 1
    // Map +/- (voltsPerDiv*5) to top/bottom (10 divisions total)
    const voltsToY = (v: number) => h / 2 - (v / (voltsPerDiv * 5)) * (h / 2)

    // Clear
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h)

    // Grid (10x10)
    ctx.lineWidth = 1
    ctx.strokeStyle = "#333"
    for (let i = 0; i <= 10; i++) {
      const x = Math.round((i / 10) * w) + 0.5
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let i = 0; i <= 10; i++) {
      const y = Math.round((i / 10) * h) + 0.5
      ctx.strokeStyle = i === 5 ? "#666" : "#333"
      ctx.lineWidth = i === 5 ? 2 : 1
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      // Voltage labels: 1 division per line
      const lineV = (5 - i) * voltsPerDiv
      ctx.fillStyle = "#888"
      ctx.font = "10px monospace"
      ctx.textAlign = "left"
      ctx.textBaseline = "bottom"
      ctx.fillText(`${lineV.toFixed(2)}V`, 2, y - 2)
    }

    // Trigger line
    if (triggerEnabled) {
      const trigLevel = mapLinear(triggerLevelNorm[0], -(voltsPerDiv * 5), (voltsPerDiv * 5))
      const y = voltsToY(trigLevel)
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = "#ff8800"
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.setLineDash([])
    }

    // Trace rendering: prefer min/max bars for accuracy; fallback to line
    const minData = samplesMinRef.current
    const maxData = samplesMaxRef.current
    if (minData && maxData && minData.length > 0 && maxData.length > 0) {
      const len = Math.min(w, minData.length, maxData.length)
      // 1) Peak bars with light alpha to show amplitude envelope
      ctx.strokeStyle = "rgba(0,255,122,0.35)"
      ctx.lineWidth = 1
      ctx.lineCap = "butt"
      ctx.beginPath()
      for (let x = 0; x < len; x++) {
        const yMin = Math.max(0, Math.min(h, voltsToY(minData[x])))
        const yMax = Math.max(0, Math.min(h, voltsToY(maxData[x])))
        if (Math.abs(yMax - yMin) < 0.5) {
          // Ensure plateaus remain visible: draw a 1px dot
          ctx.moveTo(x + 0.5, yMin)
          ctx.lineTo(x + 0.5, yMin + 0.5)
        } else {
          ctx.moveTo(x + 0.5, yMax)
          ctx.lineTo(x + 0.5, yMin)
        }
      }
      ctx.stroke()

      // 2) Midline to reveal horizontal segments (plateaus)
      ctx.strokeStyle = "#00ff7a"
      ctx.lineWidth = 1.5
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.beginPath()
      for (let x = 0; x < len; x++) {
        const mid = 0.5 * (minData[x] + maxData[x])
        const y = Math.max(0, Math.min(h, voltsToY(mid)))
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    } else if (lineData && lineData.length > 0) {
      ctx.strokeStyle = "#00ff7a"
      ctx.lineWidth = 2
      ctx.lineJoin = "round"
      ctx.lineCap = "round"
      ctx.beginPath()
      const len = Math.min(w, lineData.length)
      for (let x = 0; x < len; x++) {
        const y = Math.max(0, Math.min(h, voltsToY(lineData[x])))
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    // Time/div readout in bottom-right (windowSec/10)
    const windowSec = mapLinear(timeDiv[0], 0.001, 2)
    const timePerDiv = windowSec / 10
    const formatTime = (t: number) => {
      if (t >= 1) return `${t.toFixed(2)} s/div`
      return `${(t * 1000).toFixed(1)} ms/div`
    }
    const label = formatTime(timePerDiv)
    ctx.font = "10px monospace"
    const metrics = ctx.measureText(label)
    const pad = 3
    const boxW = metrics.width + pad * 2
    const boxH = 14
    ctx.fillStyle = "rgba(0,0,0,0.6)"
    ctx.fillRect(w - boxW - 4, h - boxH - 4, boxW, boxH)
    ctx.fillStyle = "#ccc"
    ctx.textAlign = "right"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(label, w - 4 - pad, h - 4 - 3)
  }, [voltsIndex, triggerEnabled, triggerLevelNorm, timeDiv])

  // Keep a ref to the latest draw function so message handler uses fresh state
  useEffect(() => { drawRef.current = draw }, [draw])

  // Remove periodic draw loop; rely on rAF from messages and on control-change redraws

  // Immediate redraw on control changes
  useEffect(() => { draw() }, [voltsIndex, triggerEnabled, triggerLevelNorm, timeDiv, draw])

  // Resize observer-like behavior
  useEffect(() => {
    const onResize = () => ensureCanvasSize()
    // Initial size
    onResize()
    // Window resize
    window.addEventListener("resize", onResize)
    // Element resize (layout-driven)
    const c = canvasRef.current
    let ro: ResizeObserver | null = null
    if (c && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => ensureCanvasSize())
      ro.observe(c)
    }
    return () => {
      window.removeEventListener("resize", onResize)
      try { ro?.disconnect() } catch { }
    }
  }, [ensureCanvasSize])

  return (
    <ModuleContainer moduleId={moduleId} title="Scope (Simple)">
      <div className="flex flex-col gap-3 h-full">
        <div className="bg-black relative w-[315px] h-[300px] rounded-xs overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>

        <div className="flex justify-between items-start">
          <div className="flex gap-6">
            <Knob value={timeDiv} onValueChange={setTimeDiv} size="sm" label="Time/Div" />

            <Knob
              value={[voltsIndex[0] / 4]}
              onValueChange={(v) => setVoltsIndex([Math.max(0, Math.min(4, Math.round(v[0] * 4)))])}
              size="sm"
              label="Volts/Div"
              steps={5}
              tickLabels={["", "", "", "", ""]}
            />
            <Knob
              value={triggerLevelNorm}
              onValueChange={setTriggerLevelNorm}
              size="sm"
              label="Trig Lvl"
            />
          </div>

          <Button
            variant={triggerEnabled ? "secondary" : "default"}
            size="xs"
            className="px-2"
            onClick={() => setTriggerEnabled((s) => !s)}
          >
            Auto
          </Button>
        </div>

        <div className="flex-1" />

        <div className="flex justify-start">
          <Port id={`${moduleId}-in`} type="input" audioType="any" label="IN" audioNode={inputRef.current ?? undefined} />
        </div>
      </div>
    </ModuleContainer>
  )
}
