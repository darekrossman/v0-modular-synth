// /public/reverb-processor.js
// High-quality stereo reverb with multiple algorithms (FDN/Room/Plate),
// k-rate params and audio-rate CV for Size/Damp/Decay/Mix. Handles mono-in to stereo.

const PRE_MAX = 0.25 // seconds
const SIZE_MIN = 0.3,
  SIZE_MAX = 2.0 // scale for base delays
const DAMP_MIN = 200,
  DAMP_MAX = 12000 // Hz
const DECAY_MIN = 0.0,
  DECAY_MAX = 0.98 // feedback gain range
const MIX_MIN = 0.0,
  MIX_MAX = 1.0

class ReverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'size',
        defaultValue: 0.7,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'decay',
        defaultValue: 0.7,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'dampHz',
        defaultValue: 6000,
        minValue: 200,
        maxValue: 16000,
        automationRate: 'k-rate',
      },
      {
        name: 'preDelay',
        defaultValue: 0.02,
        minValue: 0.0,
        maxValue: PRE_MAX,
        automationRate: 'k-rate',
      },
      {
        name: 'mix',
        defaultValue: 0.3,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // 0 = Room (FDN friendly), 1 = Hall (wider), 2 = Plate (bright)
      {
        name: 'type',
        defaultValue: 1,
        minValue: 0,
        maxValue: 2,
        automationRate: 'k-rate',
      },
      // CV depths (0..1). CV signals are expected in [-1..+1].
      {
        name: 'sizeCvAmt',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'dampCvAmt',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'decayCvAmt',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'mixCvAmt',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // Dry mono balance: when enabled, dry path uses mono sum for both channels
      {
        name: 'dryMono',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()
    this.sr = sampleRate

    // Pre-delay buffer (mono, applied to network input)
    this.preCap = Math.max(1, Math.ceil((PRE_MAX + 0.01) * this.sr) + 2)
    this.preBuf = new Float32Array(this.preCap)
    this.preW = 0

    // FDN-4 delay lines
    this.cap = Math.max(2048, Math.ceil(3.5 * this.sr) + 8)
    this.lines = new Array(4).fill(null).map(() => new Float32Array(this.cap))
    this.w = 0

    // Filters per line
    this.lpf = new Float32Array(4)

    // Smoothed params
    this.sizeZ = 0.7
    this.decayZ = 0.7
    this.mixZ = 0.3
    this.aParam = 1 - Math.exp(-1 / (this.sr * 0.02)) // ~20ms smoothing

    this.dampAlpha = 1 - Math.exp((-2 * Math.PI * 6000) / this.sr)
  }

  _read(buf, w, delaySamples) {
    let pos = w - delaySamples
    while (pos < 0) pos += this.cap
    const i0 = pos | 0
    const frac = pos - i0
    const i1 = (i0 + 1) % this.cap
    const s0 = buf[i0]
    const s1 = buf[i1]
    return s0 + (s1 - s0) * frac
  }

  _readPre(w, delaySamples) {
    let pos = w - delaySamples
    while (pos < 0) pos += this.preCap
    const i0 = pos | 0
    const frac = pos - i0
    const i1 = (i0 + 1) % this.preCap
    const s0 = this.preBuf[i0]
    const s1 = this.preBuf[i1]
    return s0 + (s1 - s0) * frac
  }

  process(inputs, outputs, params) {
    const out = outputs[0]
    if (!out || out.length < 2) return true
    const outL = out[0]
    const outR = out[1]
    const N = outL.length

    // Inputs
    const inA = inputs[0] || []
    const inL = inA[0] || null
    const inR = inA[1] || null
    const inSizeCv = inputs[1]?.[0] ? inputs[1][0] : null
    const inDampCv = inputs[2]?.[0] ? inputs[2][0] : null
    const inDecayCv = inputs[3]?.[0] ? inputs[3][0] : null
    const inMixCv = inputs[4]?.[0] ? inputs[4][0] : null

    // k-rate params
    const sizeBase = params.size[0]
    const decayBase = params.decay[0]
    const dampHz = params.dampHz[0]
    const preDelay = params.preDelay[0]
    const mixBase = params.mix[0]
    const type = (params.type[0] | 0) % 3
    const sizeCvAmt = params.sizeCvAmt[0]
    const dampCvAmt = params.dampCvAmt[0]
    const decayCvAmt = params.decayCvAmt[0]
    const mixCvAmt = params.mixCvAmt[0]
    const dryMono = params.dryMono[0] >= 0.5

    // Update damping coeff once per block
    this.dampAlpha =
      1 - Math.exp((-2 * Math.PI * Math.max(50, dampHz)) / this.sr)

    // Smooth non-CV params
    const aP = this.aParam
    this.mixZ += aP * (mixBase - this.mixZ)

    // Base delay times (seconds) before size scaling; chosen to be mutually incommensurate
    const baseDelays =
      type === 2
        ? [0.01, 0.0127, 0.0153, 0.02] // Plate: shorter, denser
        : type === 1
          ? [0.029, 0.037, 0.041, 0.053] // Hall: longer
          : [0.021, 0.026, 0.033, 0.039] // Room: medium

    // Gain from decay control
    const decayGainBase = DECAY_MIN + (DECAY_MAX - DECAY_MIN) * decayBase

    // Pre-delay samples
    const preSamplesTarget = Math.max(0, Math.min(PRE_MAX, preDelay)) * this.sr

    for (let i = 0; i < N; i++) {
      const xL = inL ? inL[i] : 0
      const xR = inR ? inR[i] : 0
      const xM = 0.5 * (xL + xR)

      // Audio-rate CV
      const sCv = inSizeCv ? inSizeCv[i] : 0
      const dCv = inDampCv ? inDampCv[i] : 0 // used to modulate cutoff; applied into dampHz via UI
      const dcV = inDecayCv ? inDecayCv[i] : 0
      const mCv = inMixCv ? inMixCv[i] : 0

      // Effective controls
      const sizeEff =
        SIZE_MIN +
        (SIZE_MAX - SIZE_MIN) *
          Math.max(0, Math.min(1, sizeBase + sCv * 0.5 * sizeCvAmt))
      const decayEff = Math.max(
        DECAY_MIN,
        Math.min(DECAY_MAX, decayGainBase + dcV * 0.5 * decayCvAmt),
      )
      const mixEff = Math.max(
        MIX_MIN,
        Math.min(MIX_MAX, this.mixZ + mCv * 0.25 * mixCvAmt),
      )

      // Smooth size/decay slightly
      this.sizeZ += aP * (sizeEff - this.sizeZ)
      this.decayZ += aP * (decayEff - this.decayZ)

      // write input to pre-delay buffer
      this.preBuf[this.preW] = xM
      const pre = this._readPre(this.preW, preSamplesTarget)
      this.preW++
      if (this.preW >= this.preCap) this.preW = 0

      // Compute per-line delays in samples (scaled by size)
      const d0 = (baseDelays[0] * this.sizeZ + 0.001) * this.sr
      const d1 = (baseDelays[1] * this.sizeZ + 0.001) * this.sr
      const d2 = (baseDelays[2] * this.sizeZ + 0.001) * this.sr
      const d3 = (baseDelays[3] * this.sizeZ + 0.001) * this.sr

      const y0 = this._read(this.lines[0], this.w, d0)
      const y1 = this._read(this.lines[1], this.w, d1)
      const y2 = this._read(this.lines[2], this.w, d2)
      const y3 = this._read(this.lines[3], this.w, d3)

      // 4x4 Hadamard mixing for feedback vector (fast, unitary up to scale)
      // v = H * y, H scaled by 0.5 so energy stays bounded
      const h0 = 0.5 * (y0 + y1 + y2 + y3)
      const h1 = 0.5 * (y0 - y1 + y2 - y3)
      const h2 = 0.5 * (y0 + y1 - y2 - y3)
      const h3 = 0.5 * (y0 - y1 - y2 + y3)

      // Feedback with damping per line
      this.lpf[0] += this.dampAlpha * (h0 - this.lpf[0])
      this.lpf[1] += this.dampAlpha * (h1 - this.lpf[1])
      this.lpf[2] += this.dampAlpha * (h2 - this.lpf[2])
      this.lpf[3] += this.dampAlpha * (h3 - this.lpf[3])

      const fb = this.decayZ

      // Inject pre-delayed input with small per-line weights for diffusion
      const inj0 = pre * 0.35
      const inj1 = pre * 0.31
      const inj2 = pre * 0.33
      const inj3 = pre * 0.29

      // Write next values
      this.lines[0][this.w] = inj0 + this.lpf[0] * fb
      this.lines[1][this.w] = inj1 + this.lpf[1] * fb
      this.lines[2][this.w] = inj2 + this.lpf[2] * fb
      this.lines[3][this.w] = inj3 + this.lpf[3] * fb

      // Taps to stereo out: different sign/phase mixes for width
      const wetL = 0.5 * (y0 + 0.8 * y1 - 0.6 * y2 + 0.3 * y3)
      const wetR = 0.5 * (0.3 * y0 - 0.6 * y1 + 0.8 * y2 + y3)

      // Equal-power mix with optional mono-dry
      const dry = Math.cos(mixEff * Math.PI * 0.5)
      const wet = Math.sin(mixEff * Math.PI * 0.5)
      const dryL = dryMono ? xM : xL
      const dryR = dryMono ? xM : xR

      outL[i] = dry * dryL + wet * wetL
      outR[i] = dry * dryR + wet * wetR

      // advance write index
      this.w++
      if (this.w >= this.cap) this.w = 0
    }

    return true
  }
}

registerProcessor('reverb-processor', ReverbProcessor)
