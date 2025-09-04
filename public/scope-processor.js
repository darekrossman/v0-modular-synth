// simple-oscilloscope-processor.js
// Two-channel oscilloscope worklet with optional rising-edge trigger
// - Uses global sampleRate
// - Emits downsampled frames at ~60fps

class SimpleOscilloscopeProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'windowSec', defaultValue: 0.2, minValue: 0.001, maxValue: 6 },
      { name: 'triggerEnabled', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'triggerLevel', defaultValue: 0, minValue: -15, maxValue: 15 },
      { name: 'autoMode', defaultValue: 1, minValue: 0, maxValue: 1 }, // 1=AUTO: free-run when no trigger
      // Hysteresis in volts to stabilize trigger around threshold
      {
        name: 'triggerHysteresis',
        defaultValue: 0.02,
        minValue: 0,
        maxValue: 1,
      },
      // 0 = CH1, 1 = CH2
      { name: 'triggerSource', defaultValue: 0, minValue: 0, maxValue: 1 },
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

    // Fixed large ring buffers (~12s) to avoid reallocations and support long windows
    this.bufferSize = Math.max(4096, Math.floor(12 * sampleRate))
    this.ring1 = new Float32Array(this.bufferSize)
    this.ring2 = new Float32Array(this.bufferSize)
    this.writeIndex = 0
    this.samplesWritten = 0

    // Display buffers: peak min/max per pixel (accurate amplitude) for each channel
    this.displayMin1 = new Float32Array(4096)
    this.displayMax1 = new Float32Array(4096)
    this.displayMin2 = new Float32Array(4096)
    this.displayMax2 = new Float32Array(4096)

    this.port.onmessage = (e) => {
      const d = e.data || {}
      if (d.type === 'config') {
        if (typeof d.outPixels === 'number')
          this.outPixels = Math.max(16, Math.min(2048, Math.floor(d.outPixels)))
      }
    }
  }

  findRisingEdge(ring, startAbsIndex, endAbsIndex, level) {
    // Search ring buffer for first crossing above trigger level
    for (let i = startAbsIndex + 1; i < endAbsIndex; i++) {
      const idx = i % this.bufferSize
      const prevIdx = (i - 1) % this.bufferSize
      const prev = ring[prevIdx]
      const curr = ring[idx]
      if (prev <= level && curr > level) {
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
    const outLen = Math.min(this.outPixels, this.displayMin1.length)
    for (let px = 0; px < outLen; px++) {
      const start = Math.floor(px * samplesPerPixel)
      const end = Math.ceil((px + 1) * samplesPerPixel)
      let min1 = Infinity,
        max1 = -Infinity
      let min2 = Infinity,
        max2 = -Infinity
      for (let s = start; s < end && s < samplesInWindow; s++) {
        const idx = (startAbsIndex + s) % this.bufferSize
        const v1 = this.ring1[idx]
        const v2 = this.ring2[idx]
        if (v1 < min1) min1 = v1
        if (v1 > max1) max1 = v1
        if (v2 < min2) min2 = v2
        if (v2 > max2) max2 = v2
      }
      if (min1 === Infinity) min1 = 0
      if (max1 === -Infinity) max1 = 0
      if (min2 === Infinity) min2 = 0
      if (max2 === -Infinity) max2 = 0
      this.displayMin1[px] = min1
      this.displayMax1[px] = max1
      this.displayMin2[px] = min2
      this.displayMax2[px] = max2
    }
    this.displayLength = outLen
    return true
  }

  emitFrame() {
    const len = this.displayLength || this.outPixels
    const ch1Min = this.displayMin1.slice(0, len)
    const ch1Max = this.displayMax1.slice(0, len)
    const ch2Min = this.displayMin2.slice(0, len)
    const ch2Max = this.displayMax2.slice(0, len)
    this.port.postMessage(
      {
        type: 'frame',
        ch1Min: ch1Min.buffer,
        ch1Max: ch1Max.buffer,
        ch2Min: ch2Min.buffer,
        ch2Max: ch2Max.buffer,
        sampleCount: len,
      },
      [ch1Min.buffer, ch1Max.buffer, ch2Min.buffer, ch2Max.buffer],
    )
  }

  process(inputs, outputs, parameters) {
    const in0 = inputs[0]?.[0]
    const in1 = inputs[0]?.[1]
    const out0 = outputs[0]?.[0]
    const out1 = outputs[0]?.[1]
    const readParam = (p, i, fallback) =>
      p && p.length > 1
        ? (p[i] ?? fallback)
        : p && p[0] !== undefined
          ? p[0]
          : fallback
    const n = Math.max(
      in0?.length || 0,
      in1?.length || 0,
      out0?.length || 0,
      out1?.length || 0,
    )
    if (n > 0) {
      for (let i = 0; i < n; i++) {
        const s0 = in0 ? in0[i] : 0
        const s1 = in1 ? in1[i] : 0
        this.ring1[this.writeIndex] = s0
        this.ring2[this.writeIndex] = s1
        this.writeIndex = (this.writeIndex + 1) % this.bufferSize
        this.samplesWritten++
        if (out0) out0[i] = s0
        if (out1) out1[i] = s1
      }
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
      const trigSrc = readParam(parameters.triggerSource, 0, 0) >= 0.5 ? 1 : 0
      // Total samples in window and pre/post split for trigger position (10% from left)
      const preSamples = Math.floor(winSec * sampleRate * 0.1)
      const windowSamples = Math.max(
        1,
        Math.floor(Math.min(6, Math.max(0.001, winSec)) * sampleRate),
      )
      const postSamples = Math.max(1, windowSamples - preSamples)
      // Search span scales with timebase so time/div affects stability
      const searchSpan = Math.min(
        this.bufferSize - 1,
        Math.max(windowSamples * 4, 1024),
      )
      // Ensure found trigger still allows a full window to the right
      const searchEnd = Math.max(1, this.samplesWritten - postSamples)
      const searchStart = Math.max(1, searchEnd - searchSpan)
      let triggerIndex = -1
      if (trigEnabled) {
        // Find the most recent rising crossing at the exact trigger level
        const ring = trigSrc === 0 ? this.ring1 : this.ring2
        for (let i = searchEnd; i > searchStart; i--) {
          const idx = i % this.bufferSize
          const prevIdx = (i - 1) % this.bufferSize
          const prev = ring[prevIdx]
          const curr = ring[idx]
          if (prev < trigLevel && curr >= trigLevel) {
            // Linear interpolation to approximate exact crossing at level
            const denom = curr - prev
            const frac = denom !== 0 ? (trigLevel - prev) / denom : 0
            const exact = i - 1 + Math.max(0, Math.min(1, frac))
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

registerProcessor('scope-processor', SimpleOscilloscopeProcessor)
