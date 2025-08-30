"use client"

import { useState, useRef, useEffect, useCallback } from "react"
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

type Mode = 0 | 1 | 2 // AUTO, NORM, SINGLE

export function ScopeModule({ moduleId }: { moduleId: string }) {
    // Control state
    const [timeScale, setTimeScale] = useState([0.2]) // normalized 0..1 → 5ms..2s
    const [voltageScaleIndex, setVoltageScaleIndex] = useState([2])
    const voltageScaleValues = [2, 5, 10, 15]
    const [triggerLevel, setTriggerLevel] = useState([0])
    const [slopeUp, setSlopeUp] = useState(true)
    const [trigSource, setTrigSource] = useState<0 | 1 | 2>(0)
    const [mode, setMode] = useState<Mode>(0)
    const [singleLatched, setSingleLatched] = useState(false)

    // Refs
    const nodeRef = useRef<AudioWorkletNode | null>(null)
    const in0Ref = useRef<GainNode | null>(null)
    const in1Ref = useRef<GainNode | null>(null)
    const in2Ref = useRef<GainNode | null>(null)
    const outRef = useRef<GainNode | null>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const frameDataRef = useRef<{ c0?: Float32Array, c1?: Float32Array, c2?: Float32Array, writePos?: number }>({})
    const rafRef = useRef<number | null>(null)

    // Initialize audio once
    useEffect(() => {
        const ac = getAudioContext()
        
        ; (async () => {
            await ac.audioWorklet.addModule("/scope-processor.js")

            const node = new AudioWorkletNode(ac, "scope-processor", {
                numberOfInputs: 3,
                numberOfOutputs: 1,
                channelCount: 1,
                channelCountMode: "explicit",
                outputChannelCount: [1],
            })
            nodeRef.current = node

            // Create inputs
            in0Ref.current = ac.createGain()
            in1Ref.current = ac.createGain()
            in2Ref.current = ac.createGain()
            in0Ref.current.gain.setValueAtTime(1, ac.currentTime)
            in1Ref.current.gain.setValueAtTime(1, ac.currentTime)
            in2Ref.current.gain.setValueAtTime(1, ac.currentTime)

            // Create output (keep processor pulled)
            outRef.current = ac.createGain()
            outRef.current.gain.setValueAtTime(0, ac.currentTime)
            
            // Connect
            in0Ref.current.connect(node, 0, 0)
            in1Ref.current.connect(node, 0, 1)
            in2Ref.current.connect(node, 0, 2)
            node.connect(outRef.current)
            outRef.current.connect(ac.destination)

            // Handle messages from processor
            node.port.onmessage = (e) => {
                const d = e.data || {}
                if (d.type === "frame") {
                    // Store the latest frame data
                    if (d.c0) frameDataRef.current.c0 = new Float32Array(d.c0)
                    if (d.c1) frameDataRef.current.c1 = new Float32Array(d.c1)
                    if (d.c2) frameDataRef.current.c2 = new Float32Array(d.c2)
                    if (typeof d.writePos === "number") frameDataRef.current.writePos = d.writePos
                } else if (d.type === "status" && d.status === "latched") {
                    setSingleLatched(true)
                }
            }
        })()

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            try { nodeRef.current?.disconnect() } catch { }
        }
    }, [moduleId])

    // Send config when controls change
    useEffect(() => {
        if (!nodeRef.current || !canvasRef.current) return
        
        const windowSec = mapLinear(timeScale[0], 0.005, 2)
        nodeRef.current.port.postMessage({
            type: "config",
            windowSec,
            trigLevel: triggerLevel[0],
            slopeUp,
            trigSource,
            mode,
            outPixels: canvasRef.current.width
        })
    }, [timeScale, triggerLevel, slopeUp, trigSource, mode])

    // Drawing
    const draw = useCallback(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        
        const width = canvas.width
        const height = canvas.height
        const vScale = voltageScaleValues[voltageScaleIndex[0]] || 1
        const voltsToY = (v: number) => height / 2 - (v / vScale) * (height / 2)

        // Clear
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        
        // Grid
        ctx.lineWidth = 1
        for (let i = 0; i <= 10; i++) {
            const x = Math.round((i / 10) * width) + 0.5
            ctx.strokeStyle = "#333"
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, height)
            ctx.stroke()
        }
        for (let i = 0; i <= 10; i++) {
            const y = Math.round((i / 10) * height) + 0.5
            ctx.strokeStyle = i === 5 ? "#666" : "#333"
            ctx.lineWidth = i === 5 ? 2 : 1
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(width, y)
            ctx.stroke()
            
            const perLine = vScale / 5
            const lineV = (5 - i) * perLine
            ctx.fillStyle = "#888"
            ctx.font = "10px monospace"
            ctx.textAlign = "left"
            ctx.fillText(`${lineV.toFixed(1)}V`, 2, y - 2)
        }

        // Trigger level
        const trigY = voltsToY(triggerLevel[0])
        ctx.strokeStyle = "#ff6600"
        ctx.lineWidth = 1
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(0, trigY)
        ctx.lineTo(width, trigY)
        ctx.stroke()
        ctx.setLineDash([])

        // Draw traces
        const drawTrace = (frame: Float32Array | undefined, color: string, lineWidth = 2) => {
            if (!frame || frame.length === 0) return
            
            ctx.strokeStyle = color
            ctx.lineWidth = lineWidth
            ctx.lineJoin = "round"
            ctx.lineCap = "round"
            ctx.beginPath()
            
            for (let x = 0; x < width && x < frame.length; x++) {
                const sample = frame[x]
                const y = Math.max(0, Math.min(height, voltsToY(sample)))
                if (x === 0) ctx.moveTo(x, y)
                else ctx.lineTo(x, y)
            }
            ctx.stroke()
        }

        drawTrace(frameDataRef.current.c0, "#00ff00", 2)
        drawTrace(frameDataRef.current.c1, "#00ffff", 1.5)
        drawTrace(frameDataRef.current.c2, "#ffff00", 1.5)
    }, [voltageScaleIndex, triggerLevel])

    // Animation loop
    useEffect(() => {
        const animate = () => {
            draw()
            rafRef.current = requestAnimationFrame(animate)
        }
        rafRef.current = requestAnimationFrame(animate)
        
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
        }
    }, [draw])

    // Canvas resize
    useEffect(() => {
        const handleResize = () => {
            const c = canvasRef.current
            if (!c) return
            const rect = c.getBoundingClientRect()
            const w = Math.floor(rect.width)
            const h = Math.floor(rect.height)
            if (c.width !== w || c.height !== h) {
                c.width = w
                c.height = h
                // Update processor with new width
                if (nodeRef.current) {
                    const windowSec = mapLinear(timeScale[0], 0.005, 2)
                    nodeRef.current.port.postMessage({
                        type: "config",
                        windowSec,
                        trigLevel: triggerLevel[0],
                        slopeUp,
                        trigSource,
                        mode,
                        outPixels: w
                    })
                }
            }
        }
        
        handleResize()
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [timeScale, triggerLevel, slopeUp, trigSource, mode])

    const armSingle = () => {
        setSingleLatched(false)
        nodeRef.current?.port.postMessage({ type: "config", armSingle: true })
    }

    const handleModeChange = (newMode: Mode) => {
        setMode(newMode)
        setSingleLatched(false)
    }

    return (
        <ModuleContainer title="Scope" moduleId={moduleId}>
            <div className="flex flex-col gap-2 h-full">
                <div className="flex items-start gap-2">
                    <div className="flex flex-col gap-3">
                        <div className="bg-black relative w-[400px] h-[320px] rounded-xs overflow-hidden">
                            <canvas ref={canvasRef} className="w-full h-full" />
                            {mode === 2 && singleLatched && (
                                <div className="absolute top-1 left-1 bg-red-600/80 text-white text-xs font-mono px-2 py-0.5 rounded-sm">
                                    HOLD
                                </div>
                            )}
                        </div>

                        <div className="flex justify-between px-2 items-center">
                            <Knob value={timeScale} onValueChange={setTimeScale} size="sm" label="Time/Div" />
                            <Knob
                                value={[voltageScaleIndex[0] / (voltageScaleValues.length - 1)]}
                                onValueChange={(v) => {
                                    const index = Math.round(v[0] * (voltageScaleValues.length - 1))
                                    setVoltageScaleIndex([Math.max(0, Math.min(voltageScaleValues.length - 1, index))])
                                }}
                                size="sm"
                                label="Volts/Div"
                                tickLabels={["2V", "5V", "10V", "15V"]}
                            />
                            <Knob 
                                value={[(triggerLevel[0] + voltageScaleValues[voltageScaleIndex[0]]) / (2 * voltageScaleValues[voltageScaleIndex[0]])]} 
                                onValueChange={(v) => {
                                    const scale = voltageScaleValues[voltageScaleIndex[0]]
                                    setTriggerLevel([mapLinear(v[0], -scale, scale)])
                                }}
                                size="sm" 
                                label="Trigger" 
                            />
                        </div>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-col gap-1">
                                {([0, 1, 2] as const).map((s) => (
                                    <Button key={s} size="xs" variant={trigSource === s ? "secondary" : "default"} onClick={() => setTrigSource(s)}>
                                        CH {s + 1}
                                    </Button>
                                ))}
                            </div>
                            <Button size="xs" variant={slopeUp ? "default" : "secondary"} onClick={() => setSlopeUp(!slopeUp)}>
                                {slopeUp ? "↑" : "↓"}
                            </Button>
                            <div className="flex flex-col gap-1">
                                <Button size="xs" variant={mode === 0 ? "secondary" : "default"} onClick={() => handleModeChange(0)}>AUTO</Button>
                                <Button size="xs" variant={mode === 1 ? "secondary" : "default"} onClick={() => handleModeChange(1)}>NORM</Button>
                                <Button size="xs" variant={mode === 2 ? "secondary" : "default"} onClick={() => handleModeChange(2)}>SINGLE</Button>
                                <Button size="xs" onClick={armSingle} disabled={mode !== 2}>ARM</Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1" />

                <div className="flex flex-col flex-1">
                    <div className="flex justify-between items-end">
                        <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full mb-1" style={{ backgroundColor: "#00ff00" }} />
                                <Port id={`${moduleId}-in1`} type="input" label="IN1" audioType="any" audioNode={in0Ref.current ?? undefined} />
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full mb-1" style={{ backgroundColor: "#00ffff" }} />
                                <Port id={`${moduleId}-in2`} type="input" label="IN2" audioType="any" audioNode={in1Ref.current ?? undefined} />
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-2 h-2 rounded-full mb-1" style={{ backgroundColor: "#ffff00" }} />
                                <Port id={`${moduleId}-in3`} type="input" label="IN3" audioType="any" audioNode={in2Ref.current ?? undefined} />
                            </div>
                        </div>

                        <Port id={`${moduleId}-out`} type="output" label="OUT" audioType="audio" audioNode={outRef.current ?? undefined} />
                    </div>
                </div>
            </div>
        </ModuleContainer>
    )
}