// Stable ZDF 4-pole ladder, no dry/parallel paths.
// - Correct TPT stages + implicit ZDF solve
// - Feedback HPF (~28 Hz) inside the loop (no dry bleed), taming LF bump at low cutoff
// - Wideband level compensation: post-ladder α0 term + low/mid K term
// - Optional tiny y3 tap mix at *high* cutoff (gated), improves top-end loudness with res
//
// Domain: 1.0 == 1 V (±5 V program ≈ ±5.0)

class LadderFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff',    defaultValue: 1000, minValue: 10,   maxValue: 20000, automationRate: 'k-rate' },
      { name: 'resonance', defaultValue: 0.0,  minValue: 0.0,  maxValue: 1.0,   automationRate: 'k-rate' }, // 0..1 -> K≈0..4
      { name: 'resComp',   defaultValue: 1.00, minValue: 0.0,  maxValue: 1.0,   automationRate: 'k-rate' }, // set to 1.0 for max hold
      { name: 'postGain',  defaultValue: 1.30, minValue: 0.5,  maxValue: 2.0,   automationRate: 'k-rate' },
    ]
  }

  constructor() {
    super()
    this.fs = sampleRate
    this.ny = this.fs * 0.5

    // ZDF integrator states
    this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0
    this.y4 = 0

    // Output DC blocker (~12 Hz), output only
    this.hpA = Math.exp(-2 * Math.PI * 12 / this.fs)
    this.hpX1 = 0; this.hpY1 = 0

    // Feedback HPF (~28 Hz) INSIDE loop
    const fbHz = 28
    this.fbA  = Math.exp(-2 * Math.PI * fbHz / this.fs)
    this.fbX1 = 0; this.fbY1 = 0
  }

  // One ZDF step; returns all taps to allow (gated) stage mixing up high.
  _stepZDF(xn, g, K) {
    const G = g / (1 + g)

    // Accumulator from previous states
    const S = this.s4 + G * (this.s3 + G * (this.s2 + G * this.s1))

    // Feedback HPF (inside loop; no dry escapes)
    const SfbHP = this.fbA * (this.fbY1 + S - this.fbX1)
    this.fbX1 = S; this.fbY1 = SfbHP

    // Zavalishin implicit solve
    const A = G * (1 + G) * (1 + G) * (1 + G) // G*(1+G)^3
    const alpha0 = 1 / (1 + K * A)
    const v = alpha0 * (xn - K * SfbHP)

    // 4 cascaded TPT one-poles (correct per-stage math)
    let v1 = (v  - this.s1) * G; const y1 = v1 + this.s1; this.s1 = y1 + v1
    let v2 = (y1 - this.s2) * G; const y2 = v2 + this.s2; this.s2 = y2 + v2
    let v3 = (y2 - this.s3) * G; const y3 = v3 + this.s3; this.s3 = y3 + v3
    let v4 = (y3 - this.s4) * G; const y4 = v4 + this.s4; this.s4 = y4 + v4

    this.y4 = y4
    return { y1, y2, y3, y4, A, alpha0 }
  }

  process(inputs, outputs, params) {
    const xIn  = inputs[0] && inputs[0][0] ? inputs[0][0] : null
    const yOut = outputs[0][0]
    const n = yOut.length
    if (!xIn) { yOut.fill(0); return true }

    const cutP  = params.cutoff
    const resP  = params.resonance
    const compP = params.resComp
    const postP = params.postGain

    // Helper
    const clamp01 = (x) => Math.max(0, Math.min(1, x))
    const smoothstep = (e0, e1, x) => {
      const t = clamp01((x - e0) / (e1 - e0))
      return t * t * (3 - 2 * t)
    }

    for (let i = 0; i < n; i++) {
      // k-rate fetch
      const fc   = Math.max(10, Math.min(this.fs * 0.49, cutP.length  > 1 ? cutP[i]  : cutP[0]))
      const r    = clamp01(resP.length  > 1 ? resP[i]  : resP[0])
      const resC = clamp01(compP.length > 1 ? compP[i] : compP[0])
      const post = Math.max(0.25, Math.min(2.0, postP.length > 1 ? postP[i] : postP[0]))

      const norm = fc / this.ny

      // Prewarp
      const g = Math.tan(Math.PI * fc / this.fs)
      if (!Number.isFinite(g)) { yOut.fill(0); return true }

      // Resonance mapping (gentle guards)
      let K = 4.0 * r
      // LF: reduce effective K only in deep bass to stop subsonic energy
      const lfShape = fc / (fc + 60)           // 0..~1
      K *= Math.pow(lfShape, 1.1)
      // Near Nyquist: mild clamp
      const KmaxFc = 4.0 - 0.8 * (norm * norm) // ~4 → ~3.2 near top
      if (K > KmaxFc) K = KmaxFc

      // ZDF step
      const xin = xIn[i] || 0
      const { y1, y2, y3, y4, A, alpha0 } = this._stepZDF(xin, g, K)
      let y = Number.isFinite(y4) ? y4 : 0

      // -------- Compensation strategy ---------------------------------------
      // 1) α0 post-comp (stronger near the top octave)
      const sTop = smoothstep(0.65, 0.98, norm) // 0..1 emphasis near Nyquist
      const pBase = 0.95
      const pTop  = 1.18       // raise slightly if you still see a dip up top
      const pEff  = pBase + (pTop - pBase) * sTop
      let compAlpha = Math.pow(1 / alpha0, pEff * resC)
      if (!Number.isFinite(compAlpha)) compAlpha = 1

      // 2) Low/mid K-comp (helps saw/square bite in mid band)
      const sMid = 1 - sTop
      const pK   = 1.05        // raise to ~1.12 if mids still sag with high res
      const compK = Math.pow(1 + K, pK * resC * sMid)

      // Total makeup (clamped)
      let comp = compAlpha * compK
      comp = Math.max(1.0, Math.min(14.0, comp))

      // 3) Tiny stage-tap assist at high cutoff (no dry path, gated down low)
      // Only when resonance is up, and only near wide-open.
      const TAP_MIX_MAX = 0.18 // 0..0.22 typical; keep small
      const tapWeight = TAP_MIX_MAX * r * (sTop ** 1.4)
      if (tapWeight > 1e-4) {
        // Blend a little y3 to hold top-end loudness; still fully filtered
        y = y * (1 - tapWeight) + y3 * tapWeight
      }

      // Output DC-block + final trim
      const hp = this.hpA * (this.hpY1 + y - this.hpX1)
      this.hpX1 = y; this.hpY1 = hp

      yOut[i] = hp * post * comp
    }

    return true
  }
}

registerProcessor('ladder-filter-processor', LadderFilterProcessor)
