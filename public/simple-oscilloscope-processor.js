// simple-oscilloscope-processor.js
// Single-channel oscilloscope worklet with optional rising-edge trigger
// - Uses global sampleRate
// - Emits downsampled frames at ~30fps

class SimpleOscilloscopeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "windowSec", defaultValue: 0.2, minValue: 0.001, maxValue: 2 },
      { name: "triggerEnabled", defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: "triggerLevel", defaultValue: 0, minValue: -15, maxValue: 15 },
      { name: "autoMode", defaultValue: 1, minValue: 0, maxValue: 1 }, // 1=AUTO: free-run when no trigger
      // Hysteresis in volts to stabilize trigger around threshold
      { name: "triggerHysteresis", defaultValue: 0.02, minValue: 0, maxValue: 1 },
    ]
  }

  constructor() {
    super()

    // Config (only outPixels via message)
    this.outPixels = 400
    this.triggerLevel = 0

    // Timing (ms)
    this.lastFrameTimeMs = 0
    this.frameIntervalMs = 16 // ~60fps for improved responsiveness

    // Fixed large ring buffer (~3s) to avoid reallocations
    this.bufferSize = Math.max(4096, Math.floor(3 * sampleRate))
    this.ring = new Float32Array(this.bufferSize)
    this.writeIndex = 0
    this.samplesWritten = 0

    // Display buffers: peak min/max per pixel (accurate amplitude)
    this.displayMin = new Float32Array(4096)
    this.displayMax = new Float32Array(4096)

    this.port.onmessage = (e) => {
      const d = e.data || {}
      if (d.type === "config") {
        if (typeof d.outPixels === "number") this.outPixels = Math.max(16, Math.min(2048, Math.floor(d.outPixels)))
      }
    }
  }

  findRisingEdge(startAbsIndex, endAbsIndex) {
    // Search ring buffer for first crossing above trigger level
    for (let i = startAbsIndex + 1; i < endAbsIndex; i++) {
      const idx = i % this.bufferSize
      const prevIdx = (i - 1) % this.bufferSize
      const prev = this.ring[prevIdx]
      const curr = this.ring[idx]
      if (prev <= this.triggerLevel && curr > this.triggerLevel) {
        return i
      }
    }
    return -1
  }

  captureWindow(samplesInWindow, triggerAbsIndex = -1) {
    const samplesPerPixel = samplesInWindow / this.outPixels

    let startAbsIndex
    if (triggerAbsIndex >= 0) {
      // Place trigger ~10% from left
      startAbsIndex = triggerAbsIndex - Math.floor(samplesInWindow * 0.1)
    } else {
      // Free-run: show latest window
      startAbsIndex = this.samplesWritten - samplesInWindow
    }

    if (this.samplesWritten < samplesInWindow) return false
    // Clamp so the window does not extend past available samples
    const maxStart = this.samplesWritten - samplesInWindow
    startAbsIndex = Math.max(0, Math.min(startAbsIndex, maxStart))

    // Align start to integer sample buckets to reduce column jitter
    const bucketSize = Math.max(1, Math.floor(samplesPerPixel))
    startAbsIndex = startAbsIndex - (startAbsIndex % bucketSize)

    // Downsample using per-pixel peak min/max to preserve amplitude
    const outLen = Math.min(this.outPixels, this.displayMin.length)
    for (let px = 0; px < outLen; px++) {
      const start = Math.floor(px * samplesPerPixel)
      const end = Math.ceil((px + 1) * samplesPerPixel)
      let minV = Infinity
      let maxV = -Infinity
      for (let s = start; s < end && s < samplesInWindow; s++) {
        const idx = (startAbsIndex + s) % this.bufferSize
        const v = this.ring[idx]
        if (v < minV) minV = v
        if (v > maxV) maxV = v
      }
      if (minV === Infinity) minV = 0
      if (maxV === -Infinity) maxV = 0
      this.displayMin[px] = minV
      this.displayMax[px] = maxV
    }
    this.displayLength = outLen
    return true
  }

  emitFrame() {
    const minV = this.displayMin.slice(0, this.displayLength || this.outPixels)
    const maxV = this.displayMax.slice(0, this.displayLength || this.outPixels)
    this.port.postMessage(
      { type: "frame", samplesMin: minV.buffer, samplesMax: maxV.buffer, sampleCount: this.displayLength || this.outPixels },
      [minV.buffer, maxV.buffer]
    )
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0]
    const out = outputs[0]?.[0]
    const readParam = (p, i, fallback) => (p && p.length > 1 ? (p[i] ?? fallback) : (p && p[0] !== undefined ? p[0] : fallback))
    if (input) {
      const n = input.length
      for (let i = 0; i < n; i++) {
        this.ring[this.writeIndex] = input[i]
        this.writeIndex = (this.writeIndex + 1) % this.bufferSize
        this.samplesWritten++
        if (out) out[i] = input[i] // pass-through to keep graph pulled
      }
    } else if (out) {
      // No input connected; explicitly zero the output to keep graph pulled predictably
      const n = out.length
      for (let i = 0; i < n; i++) out[i] = 0
    }

    // Throttle frames
    const nowMs = currentTime * 1000
    if (nowMs - this.lastFrameTimeMs >= this.frameIntervalMs) {
      this.lastFrameTimeMs = nowMs
      const winSec = readParam(parameters.windowSec, 0, 0.2)
      const trigEnabled = readParam(parameters.triggerEnabled, 0, 0) > 0.5
      const trigLevel = readParam(parameters.triggerLevel, 0, 0)
      const autoMode = readParam(parameters.autoMode, 0, 1) > 0.5
      const trigHyst = readParam(parameters.triggerHysteresis, 0, 0.02)
      // Total samples in window and pre/post split for trigger position (10% from left)
      const preSamples = Math.floor(winSec * sampleRate * 0.1)
      const windowSamples = Math.max(1, Math.floor(Math.min(2, Math.max(0.001, winSec)) * sampleRate))
      const postSamples = Math.max(1, windowSamples - preSamples)
      // Search span scales with timebase so time/div affects stability
      const searchSpan = Math.min(this.bufferSize - 1, Math.max(windowSamples * 4, 1024))
      // Ensure found trigger still allows a full window to the right
      const searchEnd = Math.max(1, this.samplesWritten - postSamples)
      const searchStart = Math.max(1, searchEnd - searchSpan)
      let triggerIndex = -1
      if (trigEnabled) {
        // Find the most recent rising crossing at the exact trigger level
        for (let i = searchEnd; i > searchStart; i--) {
          const idx = i % this.bufferSize
          const prevIdx = (i - 1) % this.bufferSize
          const prev = this.ring[prevIdx]
          const curr = this.ring[idx]
          if (prev < trigLevel && curr >= trigLevel) {
            // Linear interpolation to approximate exact crossing at level
            const denom = (curr - prev)
            const frac = denom !== 0 ? (trigLevel - prev) / denom : 0
            const exact = (i - 1) + Math.max(0, Math.min(1, frac))
            triggerIndex = Math.floor(exact)
            break
          }
        }

        if (triggerIndex >= 0) {
          if (this.captureWindow(windowSamples, triggerIndex)) this.emitFrame()
        } else {
          // AUTO: if enabled, free-run when no valid trigger crossing this frame
          if (autoMode) {
            if (this.captureWindow(windowSamples, -1)) this.emitFrame()
          } else {
            // NORM: hold last frame
          }
        }
      } else {
        // Free-run mode when trigger disabled
        if (this.captureWindow(windowSamples, -1)) this.emitFrame()
      }
    }

    return true
  }
}

registerProcessor("simple-oscilloscope-processor", SimpleOscilloscopeProcessor)
