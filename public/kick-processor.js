// kick-processor.js
// Analog-style 808/909 kick generator. Mono. Triggered via 0/5V input.
// Inputs:
//  0: trigger (0..5V) with Schmitt/hysteresis + deglitch
//  1: tune v/oct (CV, additive to base pitch)
//  2: sweep CV (bipolar, ±5V expected)
//  3: attack CV (0..10V)
//  4: decay CV (0..10V)
// Outputs:
//  0: mono audio (±5V equivalent)

const TWO_PI = Math.PI * 2

class KickProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'baseFreq',
        defaultValue: 60,
        minValue: 30,
        maxValue: 160,
        automationRate: 'k-rate',
      },
      {
        name: 'sweepSemis',
        defaultValue: 10,
        minValue: 0,
        maxValue: 24,
        automationRate: 'k-rate',
      },
      {
        name: 'decaySeconds',
        defaultValue: 0.6,
        minValue: 0.04,
        maxValue: 2.5,
        automationRate: 'k-rate',
      },
      {
        name: 'attackAmount',
        defaultValue: 0.25,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'sweepCvAmt',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'attackCvAmt',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'decayCvAmt',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'model',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      }, // 0=808, 1=909
      {
        name: 'outputGain',
        defaultValue: 5,
        minValue: 0,
        maxValue: 10,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()
    // State
    this.phase = 0
    this.pitchEnv = 0 // semitones above base at current time
    this.ampEnv = 0 // 0..1 amplitude envelope
    this.clickEnv = 0 // transient envelope for click path
    this.active = false // whether a hit is currently active

    // Trigger Schmitt + deglitch
    this.gate = 0
    this.lastGate = 0
    this.deadUntil = -1
    this.hiThresh = 2.5
    this.loThresh = 1.5

    // Precompute constants
    this.FLOOR = 1e-4
    this.EPSILON = 0.001
    this.LN_1_OVER_EPS = Math.log(1 / this.EPSILON)

    // Model-dependent pitch sweep taus (seconds)
    this.tauPitch808 = 0.02 // ~20 ms
    this.tauPitch909 = 0.04 // ~40 ms

    // DC blocker (one-pole HPF ~20 Hz)
    const fc = 20
    this.dc_a = Math.exp((-2 * Math.PI * fc) / sampleRate)
    this.dc_z = 0
    this.dc_y = 0

    // Transient generator uses difference-of-exponentials (clean, non-tonal)
    this.rng = 123456789 // legacy PRNG retained for compatibility
    this.clickFast = 0
    this.clickSlow = 0

    // De-click smoothing (~0.5 ms) after retriggers
    this.declickWindowSamples = Math.max(1, Math.floor(sampleRate * 0.0005))
    this.declickAlpha = 1 - Math.exp(-1 / (sampleRate * 0.0005))
    this.declickSamplesLeft = 0
    this.smoothY = 0

    // Click envelope time range (manages transient length without hard impulses)
    this.clickTauMin = 0.001 // 1 ms (most intense)
    this.clickTauMax = 0.008 // 8 ms (softer)
  }

  rand() {
    // LCG 32-bit, returns -1..1
    this.rng = (1664525 * this.rng + 1013904223) >>> 0
    return this.rng / 2147483648 - 1
  }

  stepToward(current, target, tau) {
    if (tau <= 0) return target
    const a = Math.exp(-1 / (tau * sampleRate))
    return target + (current - target) * a
  }

  readParam(p, i, fallback) {
    return p.length > 1 ? (p[i] ?? fallback) : (p[0] ?? fallback)
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0]
    if (!out || out.length === 0) return true
    const channel = out[0]
    if (!channel) return true

    const trigBus = inputs[0]?.[0] || null
    const tuneBus = inputs[1]?.[0] || null
    const sweepBus = inputs[2]?.[0] || null
    const attackBus = inputs[3]?.[0] || null
    const decayBus = inputs[4]?.[0] || null

    const n = channel.length

    for (let i = 0; i < n; i++) {
      // Read k-rate params (first sample) or per-sample if a-rate provided later
      const baseFreq = this.readParam(parameters.baseFreq, i, 60)
      const sweepSemis = this.readParam(parameters.sweepSemis, i, 10)
      let decaySeconds = this.readParam(parameters.decaySeconds, i, 0.6)
      let attackAmount = this.readParam(parameters.attackAmount, i, 0.25)
      const sweepCvAmt = this.readParam(parameters.sweepCvAmt, i, 0)
      const attackCvAmt = this.readParam(parameters.attackCvAmt, i, 0)
      const decayCvAmt = this.readParam(parameters.decayCvAmt, i, 0)
      const model = this.readParam(parameters.model, i, 0) >= 0.5 ? 1 : 0
      const outGain = this.readParam(parameters.outputGain, i, 5)

      // Inputs
      const trigIn = trigBus ? trigBus[i] || 0 : 0
      const vOct = tuneBus ? tuneBus[i] || 0 : 0
      const sweepCv = sweepBus ? sweepBus[i] || 0 : 0 // -1..1 or ±5V normalized upstream
      const attackCv = attackBus ? attackBus[i] || 0 : 0 // 0..10V
      const decayCv = decayBus ? decayBus[i] || 0 : 0 // 0..10V

      // Schmitt trigger with deglitch (0.5 ms)
      if (this.deadUntil < currentFrame + i) {
        if (this.gate === 0 && trigIn >= this.hiThresh) {
          this.gate = 1
          this.deadUntil = currentFrame + i + Math.floor(sampleRate * 0.0005)
          // Rising edge: start hit
          this.active = true
          // Start at zero-crossing to avoid clicks (sine=0 phase, triangle=quarter-cycle)
          this.phase = model === 0 ? 0 : TWO_PI * 0.25
          // Enable brief output smoothing window
          this.declickSamplesLeft = this.declickWindowSamples
          // Initialize envelopes
          // Pitch env starts at computed sweep (semis) and decays to 0
          const sweepFromCv = sweepCv * 12 * sweepCvAmt // ±12 semis scaled
          this.pitchEnv = Math.max(0, Math.min(48, sweepSemis + sweepFromCv))
          // Amp env starts at 1
          this.ampEnv = 1
          // Initialize transient generators
          this.clickFast = 1
          this.clickSlow = 1
        } else if (this.gate === 1 && trigIn <= this.loThresh) {
          this.gate = 0
          this.deadUntil = currentFrame + i + Math.floor(sampleRate * 0.0005)
        }
      }

      // Apply CV to params
      // Attack CV: 0..10V -> 0..1 scaled
      if (attackCvAmt > 0 && attackCv !== 0) {
        attackAmount += (attackCv / 10) * attackCvAmt
      }
      // Decay CV: 0..10V mapped to range [0.04, 2.5] linearly around base
      if (decayCvAmt > 0 && decayCv !== 0) {
        const minD = 0.04,
          maxD = 2.5
        const target =
          minD + (maxD - minD) * Math.max(0, Math.min(1, decayCv / 10))
        decaySeconds = decaySeconds * (1 - decayCvAmt) + target * decayCvAmt
      }

      // Clamp params
      const freqBaseEff = Math.max(30, Math.min(160, baseFreq))
      const attackEff = Math.max(0, Math.min(1, attackAmount))
      const decayEff = Math.max(0.04, Math.min(2.5, decaySeconds))

      // Compute instantaneous frequency with 1V/oct and pitch envelope
      // pitchEnv (semis) -> ratio 2^(semitones/12)
      const freqFromEnv = 2 ** (this.pitchEnv / 12)
      let frequency = freqBaseEff * freqFromEnv * 2 ** vOct
      frequency = Math.max(10, Math.min(frequency, sampleRate / 3))

      // Model-dependent parameters
      const tauPitch = model === 0 ? this.tauPitch808 : this.tauPitch909
      const drive = model === 0 ? 0.0 : 0.2 // 909 has slight drive
      const coreShape = model // 0=sine, 1=triangle-like

      // Envelope decays (per-sample one-pole toward target)
      // Amp env decays from 1 -> 0 over decayEff seconds to within EPSILON
      const tauAmp = decayEff / this.LN_1_OVER_EPS
      this.ampEnv = this.stepToward(this.ampEnv, 0.0, tauAmp)
      // Pitch env decays from current -> 0
      this.pitchEnv = this.stepToward(this.pitchEnv, 0.0, tauPitch)
      // Transient state decays: difference of exponentials
      const cFMin = model === 0 ? 0.0004 : 0.00025
      const cFMax = model === 0 ? 0.0018 : 0.0012
      const cSMin = model === 0 ? 0.0016 : 0.001
      const cSMax = model === 0 ? 0.006 : 0.004
      const tauFast = cFMin + (cFMax - cFMin) * attackEff
      const tauSlow = cSMin + (cSMax - cSMin) * attackEff
      this.clickFast = this.stepToward(this.clickFast, 0.0, tauFast)
      this.clickSlow = this.stepToward(this.clickSlow, 0.0, tauSlow)

      // Core oscillator
      let core = 0
      if (coreShape === 0) {
        // 808: damped sine
        core = Math.sin(this.phase)
      } else {
        // 909: triangle-like, simple integrated square
        const t = (this.phase % TWO_PI) / TWO_PI
        core = t < 0.5 ? 4 * t - 1 : 3 - 4 * t
      }

      // Advance phase
      this.phase += (TWO_PI * frequency) / sampleRate
      if (this.phase >= TWO_PI) this.phase -= TWO_PI

      // Attack transient: difference-of-exponentials (no noise, no tonal ring)
      let click = 0
      const clickPower = Math.abs(this.clickFast - this.clickSlow)
      if (clickPower > this.FLOOR) {
        const clickGain = 1 - attackEff // min attack => strongest
        click = (this.clickFast - this.clickSlow) * clickGain * 1.2
      }

      // Soft drive for 909
      if (drive > 0) {
        core = Math.tanh(core * (1 + 4 * drive))
      }

      // Mix
      let s = core * this.ampEnv + click

      // Brief smoothing after retrigger to avoid discontinuities/clicks
      if (this.declickSamplesLeft > 0) {
        this.smoothY = this.smoothY + this.declickAlpha * (s - this.smoothY)
        s = this.smoothY
        this.declickSamplesLeft--
      } else {
        this.smoothY = s
      }

      // DC block
      const x = s
      const y = x - this.dc_z + this.dc_a * this.dc_y
      this.dc_z = x
      this.dc_y = y
      s = y

      // Output gain and clamp
      s *= outGain
      if (s > 5) s = 5
      else if (s < -5) s = -5

      // Auto-deactivate when very quiet to avoid denormals (not strictly needed)
      if (
        this.ampEnv < this.FLOOR &&
        Math.max(this.clickFast, this.clickSlow) < this.FLOOR &&
        this.pitchEnv < this.FLOOR
      ) {
        this.active = false
      }

      channel[i] = s
    }

    return true
  }
}

registerProcessor('kick-processor', KickProcessor)
