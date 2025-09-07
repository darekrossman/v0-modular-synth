// State Variable Filter (TPT/Zavalishin) with LP and HP outputs
// - Inputs: [0] audio, [1] cutoff CV (V/Oct), [2] resonance CV (bipolar -10..+10 V), [3] drive CV (bipolar)
// - Outputs: [0] lowpass, [1] highpass
// Domain: 1.0 == 1 V; typical audio ±5 V, CV ±10 V

class SVFFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'cutoff',
        defaultValue: 1000,
        minValue: 10,
        maxValue: 12000,
        automationRate: 'k-rate',
      },
      {
        name: 'resonance', // 0..1 mapped to Q
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'drive', // 0..1 mapped to input gain
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'cutoffCvAmt', // 0..1 attenuator, 1 V/octave
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'resCvAmt', // 0..1 attenuator for resonance
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'driveCvAmt', // 0..1 attenuator for drive
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()
    this.fs = sampleRate
    this.ny = this.fs * 0.5

    // TPT state variables
    this.s1 = 0 // integrator 1 state (bandpass memory)
    this.s2 = 0 // integrator 2 state (lowpass memory)

    // Lightweight output limiting
    this.softKnee = 5
    this.hard = 10
  }

  _clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x
  }

  _limit(x) {
    const ax = Math.abs(x)
    if (ax <= this.softKnee) return x
    const excess = ax - this.softKnee
    const span = this.hard - this.softKnee
    const y =
      Math.sign(x) * (this.softKnee + Math.tanh(excess / 3) * (span - 1))
    return y
  }

  process(inputs, outputs, params) {
    const xIn = inputs[0]?.[0] || null
    const cutoffCv = inputs[1]?.[0] || null
    const resCv = inputs[2]?.[0] || null
    const driveCv = inputs[3]?.[0] || null

    const lpOut = outputs[0]?.[0]
    const hpOut = outputs[1]?.[0]
    const n = lpOut ? lpOut.length : 0

    if (!lpOut || !hpOut) return true

    if (!xIn) {
      lpOut.fill(0)
      hpOut.fill(0)
      return true
    }

    const cutP = params.cutoff
    const resP = params.resonance
    const drvP = params.drive
    const cutAmtP = params.cutoffCvAmt
    const resAmtP = params.resCvAmt
    const drvAmtP = params.driveCvAmt

    for (let i = 0; i < n; i++) {
      // Base (k-rate)
      let fc = Math.max(
        10,
        Math.min(this.fs * 0.49, cutP.length > 1 ? cutP[i] : cutP[0]),
      )
      let rNorm = this._clamp01(resP.length > 1 ? resP[i] : resP[0])
      let dNorm = this._clamp01(drvP.length > 1 ? drvP[i] : drvP[0])
      const cutAmt = this._clamp01(cutAmtP.length > 1 ? cutAmtP[i] : cutAmtP[0])
      const resAmt = this._clamp01(resAmtP.length > 1 ? resAmtP[i] : resAmtP[0])
      const drvAmt = this._clamp01(drvAmtP.length > 1 ? drvAmtP[i] : drvAmtP[0])

      // CV: cutoff 1V/oct, resonance/drive bipolar (-10..+10 V)
      if (cutoffCv) {
        const cv = Math.max(-10, Math.min(10, cutoffCv[i] || 0))
        const oct = cv * cutAmt
        fc = fc * 2 ** oct
        fc = Math.max(20, Math.min(12000, fc))
      }

      if (resCv) {
        const v = Math.max(-10, Math.min(10, resCv[i] || 0))
        rNorm = this._clamp01(rNorm + (v / 10) * resAmt)
      }

      if (driveCv) {
        const v = Math.max(-10, Math.min(10, driveCv[i] || 0))
        dNorm = this._clamp01(dNorm + (v / 10) * drvAmt)
      }

      // Map resonance 0..1 -> Q in [0.5 .. 12]; R = 1/Q
      const Q = 0.5 + rNorm ** 1.2 * 11.5
      const R = 1 / Q

      // Map drive 0..1 -> input gain ~ [1 .. 10] (gentle exp)
      const drive = 1 + dNorm ** 1.5 * 9

      // Prewarp / compute g
      const wc = (2 * Math.PI * fc) / this.fs
      let g = Math.tan(wc / 2)
      if (!Number.isFinite(g) || g <= 0) g = 1

      // TPT SVF step
      // v1 = (x - R*s1 - s2) / (1 + R*g + g^2)
      const x = Math.max(-10, Math.min(10, (xIn[i] || 0) * drive))
      const denom = 1 + R * g + g * g
      const v1 = (x - R * this.s1 - this.s2) / denom
      const v2 = this.s1 + g * v1 // bandpass
      const v3 = this.s2 + g * v2 // lowpass

      this.s1 = v2 + g * v1
      this.s2 = v3 + g * v2

      // Outputs: lowpass=v3, highpass=v1
      let lp = v3
      let hp = v1

      // Light soft limit to keep Eurorack bounds
      lp = this._limit(lp)
      hp = this._limit(hp)

      lpOut[i] = Number.isFinite(lp) ? lp : 0
      hpOut[i] = Number.isFinite(hp) ? hp : 0
    }

    return true
  }
}

registerProcessor('svf-filter-processor', SVFFilterProcessor)
registerProcessor('svf-filter-processor', SVFFilterProcessor)
registerProcessor('svf-filter-processor', SVFFilterProcessor)
