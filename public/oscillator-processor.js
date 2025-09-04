// oscillator-processor.js
// v6: Add Morph CV input (inputs[4]) + morphCvAmt parameter.
// Waves: sine, square, saw, triangle. PolyBLEP on saw/square. Instant waveform switching.

const TWO_PI = Math.PI * 2

class OscillatorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 0.1, maxValue: 20000 },
      // 0=sine, 1=square, 2=sawtooth, 3=triangle
      { name: 'waveform', defaultValue: 1, minValue: 0, maxValue: 3 },
      { name: 'phase', defaultValue: 0, minValue: 0, maxValue: 6.28 },
      { name: 'tune', defaultValue: 0, minValue: -600, maxValue: 600 }, // cents
      { name: 'octave', defaultValue: 0, minValue: -4, maxValue: 4 },
      { name: 'pulseWidth', defaultValue: 0.5, minValue: 0.01, maxValue: 0.99 },
      { name: 'gain', defaultValue: 5, minValue: 0, maxValue: 10 }, // ±5V equiv
      { name: 'syncAmount', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'waveformMorph', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'fmAmount', defaultValue: 0, minValue: 0, maxValue: 1 }, // depth for FM input
      { name: 'pwmCvAmt', defaultValue: 0, minValue: 0, maxValue: 1 }, // depth for PWM input
      { name: 'morphCvAmt', defaultValue: 0, minValue: 0, maxValue: 1 }, // NEW: depth for Morph CV
    ]
  }

  constructor(options) {
    super(options)
    this.phase = 0
    this.syncPhase = 0
    this.sampleRate = sampleRate
    this.lastSyncInput = 0
    this.syncTriggered = false
  }

  polyBLEP(t, dt) {
    if (t < dt) {
      t /= dt
      return t + t - t * t - 1
    }
    if (t > 1 - dt) {
      t = (t - 1) / dt
      return t * t + 2 * t + 1
    }
    return 0
  }

  readParam(p, i, fallback) {
    return p.length > 1 ? (p[i] ?? fallback) : (p[0] ?? fallback)
  }

  generateWaveform(waveform, phase, frequency, pulseWidth, morphAmount) {
    const wfIndex = Math.floor(waveform) // 0..3
    const phaseWrapped = ((phase % TWO_PI) + TWO_PI) % TWO_PI
    const t = phaseWrapped / TWO_PI // [0,1)
    const dt = frequency / this.sampleRate

    const wfIsDiscrete = Math.abs(waveform - wfIndex) < 1e-6
    const morphAmt = wfIsDiscrete ? morphAmount : 0
    const morphTarget = Math.min(wfIndex + 1, 3)

    let baseOutput = 0
    let morphOutput = 0

    switch (wfIndex) {
      case 0:
        baseOutput = Math.sin(phase)
        break // sine
      case 1: {
        // square (PWM) + BLEP
        const p = pulseWidth
        baseOutput = t < p ? 1 : -1
        baseOutput += this.polyBLEP(t, dt) // rising at t=0
        const tp = t - p
        const tpWrap = tp < 0 ? tp + 1 : tp
        baseOutput -= this.polyBLEP(tpWrap, dt) // falling at t=p
        break
      }
      case 2: {
        // saw + BLEP
        baseOutput = 2 * t - 1
        baseOutput -= this.polyBLEP(t, dt)
        break
      }
      case 3: {
        // triangle
        baseOutput = t < 0.5 ? 4 * t - 1 : 3 - 4 * t
        break
      }
    }

    if (morphAmt > 0 && morphTarget !== wfIndex) {
      switch (morphTarget) {
        case 1: {
          const p = pulseWidth
          let m = t < p ? 1 : -1
          m += this.polyBLEP(t, dt)
          const tp = t - p
          const tpWrap = tp < 0 ? tp + 1 : tp
          m -= this.polyBLEP(tpWrap, dt)
          morphOutput = m
          break
        }
        case 2:
          morphOutput = 2 * t - 1 - this.polyBLEP(t, dt)
          break
        case 3:
          morphOutput = t < 0.5 ? 4 * t - 1 : 3 - 4 * t
          break
        default:
          morphOutput = Math.sin(phase)
      }
    }

    const out = baseOutput * (1 - morphAmt) + morphOutput * morphAmt
    return Math.max(-1, Math.min(1, out))
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0]
    if (!output || output.length === 0) return true

    const numChannels = output.length
    const blockSize = output[0].length

    const noteBus = inputs[0]?.[0] || null // 1V/Oct
    const syncBus = inputs[1]?.[0] || null // audio/gate
    const pwmBus = inputs[2]?.[0] || null // -1..1
    const fmBus = inputs[3]?.[0] || null // -1..1 (exp FM)
    const morphBus = inputs[4]?.[0] || null // -1..1  NEW

    for (let i = 0; i < blockSize; i++) {
      const baseFreq = this.readParam(parameters.frequency, i, 440)
      const waveform = this.readParam(parameters.waveform, i, 1)
      const phaseOffset = this.readParam(parameters.phase, i, 0)
      const tune = this.readParam(parameters.tune, i, 0)
      const octave = this.readParam(parameters.octave, i, 0)
      const pulseWidth = this.readParam(parameters.pulseWidth, i, 0.5)
      const gain = this.readParam(parameters.gain, i, 5)
      const syncAmount = this.readParam(parameters.syncAmount, i, 0)
      const morphBase = this.readParam(parameters.waveformMorph, i, 0)
      const fmAmount = this.readParam(parameters.fmAmount, i, 0)
      const pwmCvAmt = this.readParam(parameters.pwmCvAmt, i, 0)
      const morphCvAmt = this.readParam(parameters.morphCvAmt, i, 0) // NEW

      const vOct = noteBus ? (noteBus[i] ?? 0) : 0
      const syncIn = syncBus ? (syncBus[i] ?? 0) : 0
      const pwmCv = pwmBus ? (pwmBus[i] ?? 0) : 0
      const fmCv = fmBus ? (fmBus[i] ?? 0) : 0
      const morphCv = morphBus ? (morphBus[i] ?? 0) : 0

      // Frequency (1V/Oct + exponential FM input scaled by fmAmount)
      let frequency = baseFreq
      frequency *= 2 ** octave
      frequency *= 2 ** (tune / 1200)
      frequency *= 2 ** vOct // Note CV
      if (fmAmount !== 0 && fmCv !== 0) {
        frequency *= 2 ** (fmCv * fmAmount) // FM CV
      }
      frequency = Math.max(0.1, Math.min(frequency, this.sampleRate / 2))

      // Hard sync
      if (syncAmount > 0) {
        if (syncIn > 0.5 && this.lastSyncInput <= 0.5) {
          this.syncPhase = this.phase * syncAmount
          this.syncTriggered = true
        }
        this.lastSyncInput = syncIn
      }

      // PWM with CV depth (±0.5 range scaled by pwmCvAmt), clamp to 0.01..0.99
      let pwEff = pulseWidth + pwmCv * (0.5 * pwmCvAmt)
      if (pwEff < 0.01) pwEff = 0.01
      else if (pwEff > 0.99) pwEff = 0.99

      // Morph CV: add ±0.5 * morphCvAmt, clamp 0..1
      let morphEff = morphBase + morphCv * (0.5 * morphCvAmt)
      if (morphEff < 0) morphEff = 0
      else if (morphEff > 1) morphEff = 1

      const currentPhase =
        this.phase + phaseOffset - (this.syncTriggered ? this.syncPhase : 0)

      const s =
        this.generateWaveform(
          waveform,
          currentPhase,
          frequency,
          pwEff,
          morphEff,
        ) * gain // ±5V

      for (let ch = 0; ch < numChannels; ch++) output[ch][i] = s

      // advance phase
      this.phase += (TWO_PI * frequency) / this.sampleRate
      if (this.phase >= TWO_PI) {
        this.phase -= TWO_PI
        this.syncTriggered = false
      }
    }

    return true
  }
}

registerProcessor('oscillator-processor', OscillatorProcessor)
