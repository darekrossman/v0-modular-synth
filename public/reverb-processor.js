// /public/reverb-processor.js
// High-quality stereo reverb with multiple algorithms (Room/Hall/Plate),
// Early reflections, FDN-8 tail with modulation, width control, tone filters,
// diffusion, ducking and freeze. Mono-in produces full stereo.

const PRE_MAX = 0.25 // seconds
const SIZE_MIN = 0.3,
  SIZE_MAX = 2.0 // scale for base delays
const DAMP_MIN = 200,
  DAMP_MAX = 16000 // Hz (internal tank damping)
const DECAY_MIN = 0.0,
  DECAY_MAX = 0.995 // feedback gain range
const MIX_MIN = 0.0,
  MIX_MAX = 1.0
const LOWCUT_MIN = 20,
  LOWCUT_MAX = 300
const HIGHCUT_MIN = 2000,
  HIGHCUT_MAX = 16000
const ER_MIN = 0.01, // 10ms
  ER_MAX = 0.08 // 80ms

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
      // 0 = Room, 1 = Hall, 2 = Plate
      {
        name: 'type',
        defaultValue: 1,
        minValue: 0,
        maxValue: 2,
        automationRate: 'k-rate',
      },
      // Stereo width of wet path
      {
        name: 'width',
        defaultValue: 0.75,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // Wet tone shaping
      {
        name: 'lowCutHz',
        defaultValue: 80,
        minValue: LOWCUT_MIN,
        maxValue: LOWCUT_MAX,
        automationRate: 'k-rate',
      },
      {
        name: 'highCutHz',
        defaultValue: 12000,
        minValue: HIGHCUT_MIN,
        maxValue: HIGHCUT_MAX,
        automationRate: 'k-rate',
      },
      // Diffusion and modulation
      {
        name: 'diffusion',
        defaultValue: 0.6,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'modRateHz',
        defaultValue: 0.2,
        minValue: 0.05,
        maxValue: 3.0,
        automationRate: 'k-rate',
      },
      {
        name: 'modDepth',
        defaultValue: 0.1,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // Early reflections
      {
        name: 'erLevel',
        defaultValue: 0.2,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'erTime',
        defaultValue: 0.35,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // Quality: 0=Eco(FDN4),1=Normal(FDN8),2=HQ(FDN8+more ER)
      {
        name: 'quality',
        defaultValue: 1,
        minValue: 0,
        maxValue: 2,
        automationRate: 'k-rate',
      },
      // Dynamics
      {
        name: 'duckAmount',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'duckReleaseMs',
        defaultValue: 250,
        minValue: 20,
        maxValue: 1000,
        automationRate: 'k-rate',
      },
      {
        name: 'freeze',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // CV depths (0..1). CV signals expected in [-1..+1]
      {
        name: 'sizeCvAmt',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'dampCvAmt',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'decayCvAmt',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'mixCvAmt',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'widthCvAmt',
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'lowCutCvAmt',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'highCutCvAmt',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'modDepthCvAmt',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'modRateCvAmt',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'duckCvAmt',
        defaultValue: 1.0,
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
    this.preCap = Math.max(1, Math.ceil((PRE_MAX + 0.1) * this.sr) + 4)
    this.preBuf = new Float32Array(this.preCap)
    this.preW = 0

    // FDN delay lines (max 8)
    this.cap = Math.max(2048, Math.ceil(3.5 * this.sr) + 8)
    this.lines = new Array(8).fill(null).map(() => new Float32Array(this.cap))
    this.w = 0

    // Filters per line (LP damping)
    this.lpf = new Float32Array(8)

    // Modulation phases per line
    this.modPhase = new Float32Array(8)

    // Diffusion all-pass buffers
    this.apCap = 2048
    this.apBuf0 = new Float32Array(this.apCap)
    this.apBuf1 = new Float32Array(this.apCap)
    this.apW = 0

    // Wet tone filter states (per channel)
    this.wetLpL = 0
    this.wetLpR = 0
    this.wetHpL = 0
    this.wetHpR = 0

    // Smoothed params
    this.sizeZ = 0.7
    this.decayZ = 0.7
    this.mixZ = 0.3
    this.widthZ = 0.75
    this.lowCutZ = 80
    this.highCutZ = 12000
    this.diffZ = 0.6
    this.modRateZ = 0.2
    this.modDepthZ = 0.1
    this.erLevelZ = 0.2
    this.aParam = 1 - Math.exp(-1 / (this.sr * 0.02)) // ~20ms smoothing

    // Dynamics
    this.env = 0
    this.envAtk = 1 - Math.exp(-1 / (this.sr * 0.005)) // 5ms attack
    this.envRel = 1 - Math.exp(-1 / (this.sr * 0.25)) // default release

    this.dampAlpha = 1 - Math.exp((-2 * Math.PI * 6000) / this.sr)
    this.lowCutAlpha = 1 - Math.exp((-2 * Math.PI * 80) / this.sr)
    this.highCutAlpha = 1 - Math.exp((-2 * Math.PI * 12000) / this.sr)
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
    const inWidthCv = inputs[5]?.[0] ? inputs[5][0] : null
    const inLowCutCv = inputs[6]?.[0] ? inputs[6][0] : null
    const inHighCutCv = inputs[7]?.[0] ? inputs[7][0] : null
    const inModDepthCv = inputs[8]?.[0] ? inputs[8][0] : null
    const inModRateCv = inputs[9]?.[0] ? inputs[9][0] : null
    const inDuckCv = inputs[10]?.[0] ? inputs[10][0] : null
    const inFreezeCv = inputs[11]?.[0] ? inputs[11][0] : null
    const inSidechain = inputs[12]?.[0] ? inputs[12][0] : null

    // k-rate params
    const sizeBase = params.size[0]
    const decayBase = params.decay[0]
    const dampHz = params.dampHz[0]
    const preDelay = params.preDelay[0]
    const mixBase = params.mix[0]
    const type = (params.type[0] | 0) % 3
    const widthBase = params.width[0]
    const lowCutBase = params.lowCutHz[0]
    const highCutBase = params.highCutHz[0]
    const diffusionBase = params.diffusion[0]
    const modRateBase = params.modRateHz[0]
    const modDepthBase = params.modDepth[0]
    const erLevelBase = params.erLevel[0]
    const erTimeBase = params.erTime[0]
    const quality = (params.quality[0] | 0) % 3
    const duckAmountBase = params.duckAmount[0]
    const duckReleaseMs = params.duckReleaseMs[0]
    const freezeBase = params.freeze[0] >= 0.5
    const sizeCvAmt = params.sizeCvAmt[0]
    const dampCvAmt = params.dampCvAmt[0]
    const decayCvAmt = params.decayCvAmt[0]
    const mixCvAmt = params.mixCvAmt[0]
    const widthCvAmt = params.widthCvAmt[0]
    const lowCutCvAmt = params.lowCutCvAmt[0]
    const highCutCvAmt = params.highCutCvAmt[0]
    const modDepthCvAmt = params.modDepthCvAmt[0]
    const modRateCvAmt = params.modRateCvAmt[0]
    const duckCvAmt = params.duckCvAmt[0]
    const dryMono = params.dryMono[0] >= 0.5

    // Update coefficients once per block
    this.dampAlpha =
      1 - Math.exp((-2 * Math.PI * Math.max(50, dampHz)) / this.sr)
    this.lowCutAlpha =
      1 - Math.exp((-2 * Math.PI * Math.max(LOWCUT_MIN, lowCutBase)) / this.sr)
    this.highCutAlpha =
      1 -
      Math.exp(
        (-2 * Math.PI * Math.max(200, Math.min(HIGHCUT_MAX, highCutBase))) /
          this.sr,
      )
    this.envRel =
      1 - Math.exp(-1 / (this.sr * Math.max(0.02, duckReleaseMs / 1000)))

    // Smooth non-CV params
    const aP = this.aParam
    this.mixZ += aP * (mixBase - this.mixZ)
    this.widthZ += aP * (widthBase - this.widthZ)
    this.lowCutZ += aP * (lowCutBase - this.lowCutZ)
    this.highCutZ += aP * (highCutBase - this.highCutZ)
    this.diffZ += aP * (diffusionBase - this.diffZ)
    this.modRateZ += aP * (modRateBase - this.modRateZ)
    this.modDepthZ += aP * (modDepthBase - this.modDepthZ)
    this.erLevelZ += aP * (erLevelBase - this.erLevelZ)

    // Base delay times (seconds) before size scaling; mutually incommensurate
    const baseDelays8 =
      type === 2
        ? [0.01, 0.0127, 0.0153, 0.02, 0.0247, 0.0283, 0.0349, 0.045]
        : type === 1
          ? [0.029, 0.037, 0.041, 0.053, 0.061, 0.071, 0.089, 0.097]
          : [0.021, 0.026, 0.033, 0.039, 0.045, 0.051, 0.057, 0.063]

    // Gain from decay control
    const decayGainBase = DECAY_MIN + (DECAY_MAX - DECAY_MIN) * decayBase

    // Pre-delay samples
    const preSamplesTarget = Math.max(0, Math.min(PRE_MAX, preDelay)) * this.sr

    // ER config
    const erTimeSec =
      ER_MIN + (ER_MAX - ER_MIN) * Math.max(0, Math.min(1, erTimeBase))
    const tapsSec = [0.006, 0.0097, 0.0123, 0.0151, 0.0202, 0.0249, 0.0313].map(
      (t) => t * (erTimeSec / 0.0313),
    )
    const tapsGain = [0.8, 0.7, 0.62, 0.55, 0.45, 0.36, 0.28]
    const tapsPan = [-0.7, 0.4, -0.3, 0.8, -0.9, 0.2, -0.5]

    // Quality -> number of lines
    const numLines = quality === 0 ? 4 : 8
    const modDepthSamples =
      (0.0005 + 0.0045 * Math.max(0, Math.min(1, this.modDepthZ))) * this.sr // up to ~5ms
    const modInc = (2 * Math.PI * Math.max(0.01, this.modRateZ)) / this.sr

    for (let i = 0; i < N; i++) {
      const xL = inL ? inL[i] : 0
      const xR = inR ? inR[i] : 0
      const xM = 0.5 * (xL + xR)

      // Audio-rate CV
      const sCv = inSizeCv ? inSizeCv[i] : 0
      const dCv = inDampCv ? inDampCv[i] : 0
      const dcV = inDecayCv ? inDecayCv[i] : 0
      const mCv = inMixCv ? inMixCv[i] : 0
      const wCv = inWidthCv ? inWidthCv[i] : 0
      const lcCv = inLowCutCv ? inLowCutCv[i] : 0
      const hcCv = inHighCutCv ? inHighCutCv[i] : 0
      const mdCv = inModDepthCv ? inModDepthCv[i] : 0
      const mrCv = inModRateCv ? inModRateCv[i] : 0
      const dkCv = inDuckCv ? inDuckCv[i] : 0
      const frzCv = inFreezeCv ? inFreezeCv[i] : 0

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
      const widthEff = Math.max(
        0,
        Math.min(1, this.widthZ + wCv * 0.5 * widthCvAmt),
      )
      // Map low/high cut via normalized range additions
      const lcNormBase = (this.lowCutZ - LOWCUT_MIN) / (LOWCUT_MAX - LOWCUT_MIN)
      const hcNormBase =
        (this.highCutZ - HIGHCUT_MIN) / (HIGHCUT_MAX - HIGHCUT_MIN)
      const lcEffNorm = Math.max(
        0,
        Math.min(1, lcNormBase + 0.25 * lcCv * lowCutCvAmt),
      )
      const hcEffNorm = Math.max(
        0,
        Math.min(1, hcNormBase + 0.25 * hcCv * highCutCvAmt),
      )
      const lowCutEff = LOWCUT_MIN + lcEffNorm * (LOWCUT_MAX - LOWCUT_MIN)
      const highCutEff = HIGHCUT_MIN + hcEffNorm * (HIGHCUT_MAX - HIGHCUT_MIN)
      const diffEff = Math.max(0, Math.min(1, this.diffZ))
      const modDepthEff = Math.max(
        0,
        Math.min(1, this.modDepthZ + 0.5 * mdCv * modDepthCvAmt),
      )
      const modRateEff = Math.max(
        0.01,
        this.modRateZ + 0.5 * mrCv * modRateCvAmt,
      )
      const duckAmtEff = Math.max(
        0,
        Math.min(1, duckAmountBase + 0.5 * dkCv * duckCvAmt),
      )
      const freeze = freezeBase || frzCv > 0.5

      // Slight smoothing for size/decay
      this.sizeZ += aP * (sizeEff - this.sizeZ)
      this.decayZ += aP * (decayEff - this.decayZ)

      // write input to pre-delay buffer
      this.preBuf[this.preW] = xM
      // pre-delay
      const pre = this._readPre(this.preW, preSamplesTarget)
      this.preW++
      if (this.preW >= this.preCap) this.preW = 0

      // Diffusion with two chained all-passes on mono injection
      const apGain = 0.1 + 0.7 * diffEff
      // AP delays (in samples), small and relatively prime
      const apD0 = 47
      const apD1 = 83
      // AP0
      let rdPos0 = this.apW - apD0
      while (rdPos0 < 0) rdPos0 += this.apCap
      const apZ0 = this.apBuf0[rdPos0 | 0]
      const apY0 = -apGain * pre + apZ0
      this.apBuf0[this.apW] = pre + apGain * apZ0
      // AP1
      let rdPos1 = this.apW - apD1
      while (rdPos1 < 0) rdPos1 += this.apCap
      const apZ1 = this.apBuf1[rdPos1 | 0]
      const apY1 = -apGain * apY0 + apZ1
      this.apBuf1[this.apW] = apY0 + apGain * apZ1
      this.apW++
      if (this.apW >= this.apCap) this.apW = 0
      const inj = freeze ? 0 : apY1

      // Compute per-line delays in samples (scaled by size) with modulation
      const modIncS = (2 * Math.PI * modRateEff) / this.sr
      const modAmpS = (0.0005 + 0.0045 * modDepthEff) * this.sr

      // Read lines
      const y = new Array(numLines)
      for (let k = 0; k < numLines; k++) {
        const dBase = (baseDelays8[k] * this.sizeZ + 0.001) * this.sr
        // per-line phase offsets baked into initial phase; LFO mod for HQ/Normal
        const lfo = quality === 0 ? 0 : Math.sin(this.modPhase[k]) * modAmpS
        const dSamp = Math.max(1, dBase + lfo)
        y[k] = this._read(this.lines[k], this.w, dSamp)
      }

      // 8x8 mixing via two 4x4 Hadamards and cross-blend
      let h = new Array(numLines)
      if (numLines === 8) {
        const a0 = 0.5 * (y[0] + y[1] + y[2] + y[3])
        const a1 = 0.5 * (y[0] - y[1] + y[2] - y[3])
        const a2 = 0.5 * (y[0] + y[1] - y[2] - y[3])
        const a3 = 0.5 * (y[0] - y[1] - y[2] + y[3])
        const b0 = 0.5 * (y[4] + y[5] + y[6] + y[7])
        const b1 = 0.5 * (y[4] - y[5] + y[6] - y[7])
        const b2 = 0.5 * (y[4] + y[5] - y[6] - y[7])
        const b3 = 0.5 * (y[4] - y[5] - y[6] + y[7])
        const s2 = Math.SQRT1_2 // ~0.7071 ensures overall 1/sqrt(8) scaling
        h = [
          s2 * (a0 + b0),
          s2 * (a1 + b1),
          s2 * (a2 + b2),
          s2 * (a3 + b3),
          s2 * (a0 - b0),
          s2 * (a1 - b1),
          s2 * (a2 - b2),
          s2 * (a3 - b3),
        ]
      } else {
        h = [
          0.5 * (y[0] + y[1] + y[2] + y[3]),
          0.5 * (y[0] - y[1] + y[2] - y[3]),
          0.5 * (y[0] + y[1] - y[2] - y[3]),
          0.5 * (y[0] - y[1] - y[2] + y[3]),
        ]
      }

      // Damping per line and feedback write
      // Adjust feedback for number of lines so RT60 perception stays consistent
      const fbBase = freeze ? 0.9995 : this.decayZ
      const fb =
        numLines === 8 ? Math.min(0.9995, 1 - (1 - fbBase) * 0.5) : fbBase
      // Inject with small decorrelated weights
      const injW = [0.35, 0.31, 0.33, 0.29, 0.27, 0.25, 0.23, 0.21]
      for (let k = 0; k < numLines; k++) {
        this.lpf[k] += this.dampAlpha * (h[k] - this.lpf[k])
        this.lines[k][this.w] = inj * injW[k] + this.lpf[k] * fb
      }

      // Advance modulation phases
      if (quality !== 0) {
        for (let k = 0; k < 8; k++) {
          this.modPhase[k] += modIncS * (1 + 0.07 * k)
          if (this.modPhase[k] > 2 * Math.PI) this.modPhase[k] -= 2 * Math.PI
        }
      }

      // Late wet taps to stereo
      let wetL = 0
      let wetR = 0
      if (numLines === 8) {
        wetL =
          0.35 *
          (y[0] +
            0.8 * y[1] -
            0.6 * y[2] +
            0.3 * y[3] -
            0.7 * y[4] +
            0.5 * y[5] -
            0.4 * y[6] +
            0.2 * y[7])
        wetR =
          0.35 *
          (0.3 * y[0] -
            0.6 * y[1] +
            0.8 * y[2] +
            y[3] +
            0.2 * y[4] -
            0.4 * y[5] +
            0.5 * y[6] -
            0.7 * y[7])
      } else {
        wetL = 0.5 * (y[0] + 0.8 * y[1] - 0.6 * y[2] + 0.3 * y[3])
        wetR = 0.5 * (0.3 * y[0] - 0.6 * y[1] + 0.8 * y[2] + y[3])
      }

      // Early reflections (stereoized)
      let erL = 0
      let erR = 0
      const erLvl = this.erLevelZ * (quality === 2 ? 1.2 : 1.0)
      if (erLvl > 0.0001) {
        for (let t = 0; t < tapsSec.length; t++) {
          const tapSamp = preSamplesTarget + tapsSec[t] * this.sr
          const e = this._readPre(this.preW, tapSamp)
          const g = tapsGain[t]
          const pan = tapsPan[t]
          const l = 0.5 * (1 - pan)
          const r = 0.5 * (1 + pan)
          erL += g * l * e
          erR += g * r * e
        }
        erL *= erLvl
        erR *= erLvl
      }

      // Wet tone shaping: HP then LP per channel
      // Update tone coefficients subtly towards instantaneous values
      const lcA =
        1 - Math.exp((-2 * Math.PI * Math.max(LOWCUT_MIN, lowCutEff)) / this.sr)
      const hcA =
        1 -
        Math.exp(
          (-2 * Math.PI * Math.max(200, Math.min(HIGHCUT_MAX, highCutEff))) /
            this.sr,
        )

      let wetChL = wetL + erL
      let wetChR = wetR + erR
      // High-pass
      this.wetHpL += lcA * (wetChL - this.wetHpL)
      this.wetHpR += lcA * (wetChR - this.wetHpR)
      wetChL = wetChL - this.wetHpL
      wetChR = wetChR - this.wetHpR
      // Low-pass
      this.wetLpL += hcA * (wetChL - this.wetLpL)
      this.wetLpR += hcA * (wetChR - this.wetLpR)
      wetChL = this.wetLpL
      wetChR = this.wetLpR

      // Width on wet only via Mid/Side
      const mid = 0.5 * (wetChL + wetChR)
      const side = 0.5 * (wetChL - wetChR)
      const w = widthEff
      wetChL = mid + w * side
      wetChR = mid - w * side

      // Ducking envelope (use sidechain if present, else dry mono)
      const sc = inSidechain ? inSidechain[i] : xM
      const target = Math.abs(sc)
      const a = target > this.env ? this.envAtk : this.envRel
      this.env += a * (target - this.env)
      const wetGain = 1 - duckAmtEff * Math.max(0, Math.min(1, this.env))
      wetChL *= wetGain
      wetChR *= wetGain

      // Equal-power mix with optional mono-dry
      const dry = Math.cos(mixEff * Math.PI * 0.5)
      const wet = Math.sin(mixEff * Math.PI * 0.5)
      const dryL = dryMono ? xM : xL
      const dryR = dryMono ? xM : xR

      outL[i] = dry * dryL + wet * wetChL
      outR[i] = dry * dryR + wet * wetChR

      // advance write index
      this.w++
      if (this.w >= this.cap) this.w = 0
    }

    return true
  }
}

registerProcessor('reverb-processor', ReverbProcessor)
