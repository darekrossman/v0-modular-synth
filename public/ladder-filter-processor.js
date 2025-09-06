// Stable ZDF 4-pole ladder, no dry/parallel paths.
// - Correct TPT stages + implicit ZDF solve
// - Feedback HPF (~28 Hz) inside the loop (no dry bleed), taming LF bump at low cutoff
// - Wideband level compensation: post-ladder α0 term + low/mid K term
// - Optional tiny y3 tap mix at *high* cutoff (gated), improves top-end loudness with res
//
// Domain: 1.0 == 1 V (±5 V program ≈ ±5.0)

// ============================================================================
// TUNING CONSTANTS (simplified)
// ============================================================================

// Resonance LF de-emphasis (reduce K near DC)
const K_DEEMPH_AMOUNT = 0.3
const K_DEEMPH_POWER = 1.5

// Maximum stable K
const K_MAX = 3.999

// Frequency-dependent K cap to tame LF resonance
const K_CAP_LOW = 3.7
const K_CAP_HIGH = 3.99
const K_CAP_POWER = 1.2

// Feedback high-pass inside loop (Hz)
const FEEDBACK_HPF_HZ = 20

// Output DC blocker (Hz)
const OUTPUT_DC_HZ = 10

// α0-based makeup exponent (base)
const MAKEUP_GAMMA = 0.8

// Output soft limiter thresholds (volts)
const LIMIT_SOFT_KNEE = 5
const LIMIT_HARD = 10

// Resonance-aware compensation amount (small to preserve character)
const RES_MAKEUP_AMOUNT = 0.35
const RES_MAKEUP_R_POWER = 1.6
const RES_MAKEUP_SHAPE_POWER = 1.4

// Moog-style resonance HF attenuation factor in K mapping
const K_MOOG_HF_ATTEN = 0.06

// Low-frequency K attenuation ramps to 1 toward Nyquist
// At norm=0 -> K_LF_MIN; at norm=1 -> 1.0
const K_LF_MIN = 0.65
const K_LF_POWER = 1.3

// Frequency gain normalization (passband tilt) Gf(norm) = a0 + a1 * norm^4
const GF_A0 = 1.0
const GF_A1 = 0.0

// ============================================================================

class LadderFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'cutoff',
        defaultValue: 1000,
        minValue: 10,
        maxValue: 10000,
        automationRate: 'k-rate',
      },
      {
        name: 'resonance',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      }, // 0..1 -> K≈0..4
      {
        name: 'drive',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      }, // Drive/saturation amount
      {
        name: 'cvAmount',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      }, // CV attenuation
      {
        name: 'resCvAmount',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      }, // Resonance CV attenuation
    ]
  }

  constructor() {
    super()
    this.fs = sampleRate
    this.ny = this.fs * 0.5

    // ZDF integrator states
    this.s1 = 0
    this.s2 = 0
    this.s3 = 0
    this.s4 = 0
    this.y4 = 0

    // Output DC blocker
    this.hpA = Math.exp((-2 * Math.PI * OUTPUT_DC_HZ) / this.fs)
    this.hpX1 = 0
    this.hpY1 = 0

    // Feedback HPF INSIDE loop
    this.fbA = Math.exp((-2 * Math.PI * FEEDBACK_HPF_HZ) / this.fs)
    this.fbX1 = 0
    this.fbY1 = 0
  }

  // Stage saturation helper: now bypassed (drive disabled)
  _satStage(x, _drive) {
    return x
  }

  // One ZDF step with saturation bypassed
  _stepZDF(xn, g, K, _drive = 0) {
    const G = g / (1 + g)

    // Accumulator from previous states
    const S = this.s4 + G * (this.s3 + G * (this.s2 + G * this.s1))

    // Feedback HPF (inside loop; no dry escapes), no nonlinear shaping
    const SfbHP = this.fbA * (this.fbY1 + S - this.fbX1)
    this.fbX1 = S
    this.fbY1 = SfbHP

    // Zavalishin implicit solve
    const A = G * (1 + G) * (1 + G) * (1 + G) // G*(1+G)^3
    const alpha0 = 1 / (1 + K * A)

    // Apply the filter equation (no input pre-compensation; makeup later)
    const v = alpha0 * (xn - K * SfbHP)

    // 4 cascaded TPT one-poles (linear)
    const v1 = (v - this.s1) * G
    const y1 = v1 + this.s1
    this.s1 = y1 + v1
    const v2 = (y1 - this.s2) * G
    const y2 = v2 + this.s2
    this.s2 = y2 + v2
    const v3 = (y2 - this.s3) * G
    const y3 = v3 + this.s3
    this.s3 = y3 + v3
    const v4 = (y3 - this.s4) * G
    const y4 = v4 + this.s4
    this.s4 = y4 + v4

    this.y4 = y4
    return { y1, y2, y3, y4, A, alpha0 }
  }

  process(inputs, outputs, params) {
    const xIn = inputs[0]?.[0] ? inputs[0][0] : null
    const cutoffCv = inputs[1]?.[0] ? inputs[1][0] : null
    const resCv = inputs[2]?.[0] ? inputs[2][0] : null
    const yOut = outputs[0][0]
    const n = yOut.length
    if (!xIn) {
      yOut.fill(0)
      return true
    }

    const cutP = params.cutoff
    const resP = params.resonance
    const cvAmtP = params.cvAmount
    const resCvAmtP = params.resCvAmount

    // Helper
    const clamp01 = (x) => Math.max(0, Math.min(1, x))

    for (let i = 0; i < n; i++) {
      // k-rate fetch
      let fc = Math.max(
        10,
        Math.min(this.fs * 0.49, cutP.length > 1 ? cutP[i] : cutP[0]),
      )
      let r = clamp01(resP.length > 1 ? resP[i] : resP[0])
      const drive = 0
      const cvAmt = clamp01(cvAmtP.length > 1 ? cvAmtP[i] : cvAmtP[0])
      const resCvAmt = clamp01(
        resCvAmtP.length > 1 ? resCvAmtP[i] : resCvAmtP[0],
      )

      // Apply CV modulation - 1V/octave standard
      // CV input is -10V to +10V in our system
      if (cutoffCv?.[i] !== undefined && cutoffCv[i] !== null) {
        const cvValue = Math.max(-10, Math.min(10, cutoffCv[i]))
        const octaveShift = cvValue * cvAmt
        const modulatedFreq = fc * 2 ** octaveShift
        fc = Math.max(20, Math.min(10000, modulatedFreq))
        fc = Math.max(10, Math.min(this.fs * 0.49, fc))
      }

      // Resonance CV - bipolar modulation -10V to +10V
      if (resCv?.[i] !== undefined && resCv[i] !== null) {
        const resCvValue = Math.max(-10, Math.min(10, resCv[i]))
        const resCvNorm = resCvValue / 10
        const modulatedRes = r + resCvNorm * resCvAmt
        r = clamp01(modulatedRes)
      }

      const norm = fc / this.ny

      // Bilinear prewarp
      const wc = (2 * Math.PI * fc) / this.fs
      const g = Math.tan(wc / 2)

      if (!Number.isFinite(g) || g <= 0 || g > 100) {
        yOut[i] = 0
        continue
      }

      // Resonance mapping: S-curve in r for smooth spread + LF attenuation + modest HF attenuation
      const rShaped = 1 - (1 - r) * (1 - r) // expands near the top without harshness
      const lfRamp = K_LF_MIN + (1 - K_LF_MIN) * norm ** K_LF_POWER
      const baseK = 4.0 * rShaped * lfRamp
      const hfAtten = 1 - K_MOOG_HF_ATTEN * norm * norm
      let K = baseK * hfAtten
      // Frequency-dependent K cap: lower cap near DC, higher cap at HF
      const cap = K_CAP_LOW + (K_CAP_HIGH - K_CAP_LOW) * norm ** K_CAP_POWER
      if (K > cap) K = cap
      if (K > K_MAX) K = K_MAX

      // Input
      let xin = xIn[i] || 0
      // Expect Eurorack levels; keep within hard limits
      xin = Math.max(-10, Math.min(10, xin))

      // ZDF step
      const { y4, alpha0 } = this._stepZDF(xin, g, K, 0)
      let y = Number.isFinite(y4) ? y4 : 0

      // α0-based makeup: base + resonance-dependent term to offset level drop with higher resonance
      const makeupBase = (1 / alpha0) ** MAKEUP_GAMMA
      const gammaRes =
        RES_MAKEUP_AMOUNT *
        rShaped ** RES_MAKEUP_R_POWER *
        (0.35 + 0.65 * norm ** RES_MAKEUP_SHAPE_POWER)
      const makeupRes = (1 / alpha0) ** gammaRes
      y *= makeupBase * makeupRes

      // Frequency gain normalization (currently unity)
      const gf = GF_A0 + GF_A1 * norm ** 4
      y *= gf

      // Output DC-block
      const hp = this.hpA * (this.hpY1 + y - this.hpX1)
      this.hpX1 = y
      this.hpY1 = hp

      // Soft limiter at Eurorack levels
      let output = hp
      if (Math.abs(output) > LIMIT_SOFT_KNEE) {
        const excess = Math.abs(output) - LIMIT_SOFT_KNEE
        const span = LIMIT_HARD - LIMIT_SOFT_KNEE
        output =
          Math.sign(output) *
          (LIMIT_SOFT_KNEE + Math.tanh(excess / 3) * (span - 1))
      }

      yOut[i] = output
    }

    return true
  }
}

// Ensure single registration
registerProcessor('ladder-filter-processor', LadderFilterProcessor)
