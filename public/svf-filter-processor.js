// State Variable Filter (TPT/Zavalishin) with LP and HP outputs
// - Inputs: [0] audio, [1] cutoff CV (V/Oct), [2] resonance CV (bipolar -10..+10 V), [3] drive CV (bipolar)
// - Outputs: [0] lowpass, [1] highpass
// Domain: 1.0 == 1 V; typical audio ±5 V, CV ±10 V

// (Oversampling removed for stability; simple 1x TPT SVF)

class SVFFilterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'cutoff',
        defaultValue: 1000,
        minValue: 10,
        maxValue: 8000,
        automationRate: 'a-rate',
      },
      {
        name: 'resonance', // 0..1 mapped to Q
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'a-rate',
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

    // Lightweight output limiting (allow headroom; limit near ±10 V)
    this.softKnee = 9
    this.hard = 10

    // Parameter smoothing (one-pole)
    const smoothTau = 0.003
    this.smoothA = Math.exp(-1 / (this.fs * smoothTau))
    this.smoothB = 1 - this.smoothA
    this.cutSm = 1000
    this.resSm = 0
    this.drvSm = 0
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

  _clamp(x, min, max) {
    return Math.max(min, Math.min(max, x))
  }

  _sat(x, k) {
    if (k <= 1e-6) return x
    return Math.tanh(k * x) / k
  }

  // Drive saturation with smooth blending
  _driveSat(x, amount) {
    // Always process through same signal path to avoid discontinuities
    // Drive amount controls how much saturation and gain we apply

    // Normalize to ±1 for tanh processing
    const normalized = x / 5

    // Drive increases both gain and saturation amount
    // At 0: gain = 1, sat = 0 (linear)
    // At 1: gain = 2.5, sat = 1 (full saturation)
    const driveGain = 1 + amount * 1.5
    const satAmount = amount

    // Apply gain before saturation
    const gained = normalized * driveGain

    // Blend between linear and saturated based on drive amount
    // This ensures smooth transition from dry to wet
    const saturated =
      gained * (1 - satAmount) + Math.tanh(gained * 0.7) * satAmount

    // Scale back to Eurorack levels
    return saturated * 5
  }

  _processSVFStep(x, g, R, driveNorm) {
    // Apply drive saturation consistently
    const xIn = this._driveSat(x, driveNorm)

    // Standard Zavalishin TPT SVF equations
    const denom = 1 + R * g + g * g
    const hp = (xIn - R * this.s1 - this.s2) / denom
    const bp = this.s1 + g * hp
    const lp = this.s2 + g * bp

    // Update integrator states
    this.s1 = bp + g * hp
    this.s2 = lp + g * bp

    // Conservative state limiting for stability
    const stateLimit = 15
    this.s1 = this._clamp(this.s1, -stateLimit, stateLimit)
    this.s2 = this._clamp(this.s2, -stateLimit, stateLimit)

    return { hp, bp, lp }
  }

  // No decimator/upsampler in the 1x path

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
      // Per-sample params (a-rate for cutoff/resonance)
      // Cutoff parameter is already in Hz from the UI's logarithmic mapping
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
        fc = Math.max(20, Math.min(8000, fc))
      }

      if (resCv) {
        const v = Math.max(-10, Math.min(10, resCv[i] || 0))
        rNorm = this._clamp01(rNorm + (v / 10) * resAmt)
      }

      if (driveCv) {
        const v = Math.max(-10, Math.min(10, driveCv[i] || 0))
        dNorm = this._clamp01(dNorm + (v / 10) * drvAmt)
      }

      // Smooth parameter updates
      this.cutSm = this.smoothA * this.cutSm + this.smoothB * fc
      this.resSm = this.smoothA * this.resSm + this.smoothB * rNorm
      this.drvSm = this.smoothA * this.drvSm + this.smoothB * dNorm

      // Compute filter coefficient from smoothed cutoff (moved up for Q calculation)
      const g = Math.tan((Math.PI * this.cutSm) / this.fs)

      // Simple, stable resonance curve
      // At res=0: Q=0.5 (no resonance)
      // At res=1: Q~5 (controlled resonance)
      const minQ = 0.5
      const maxQ = 5

      // Use smoothed resonance for consistency
      let Q = minQ + this.resSm ** 1.8 * (maxQ - minQ)

      // Frequency-dependent Q reduction to prevent instability at both ends
      const freqNorm = this.cutSm / this.ny

      // Low-frequency instability prevention
      if (freqNorm < 0.02) {
        // Below ~200 Hz at 48kHz
        // Exponential reduction for smoother transition
        const lfScale = (freqNorm / 0.02) ** 1.5
        Q = minQ + (Q - minQ) * lfScale
      }

      // High-frequency instability prevention - very aggressive
      // Start reducing Q much earlier to prevent any instability
      if (g > 0.3) {
        // Start reducing Q around 2 kHz at 48 kHz (much earlier)
        // Exponential reduction for more aggressive control
        const normalizedG = (g - 0.3) / (1 - 0.3) // 0 to 1 range from g=0.3 to g=1
        const hfScale = Math.max(0.1, (1 - normalizedG) ** 2) // Quadratic falloff
        Q = minQ + (Q - minQ) * hfScale
      }

      const R = 1 / Q

      // Input sample (expect ±5 V program level)
      const xin = Math.max(-5, Math.min(5, xIn[i] || 0))

      // Simple SVF step without complex saturation
      const s = this._processSVFStep(xin, g, R, this.drvSm)

      // Aggressive gain compensation to prevent resonant peaks from exceeding ±5V
      // The resonance gain at the cutoff frequency is approximately Q
      // We need to compensate for this gain increase
      let gainComp = 1

      // Always apply compensation when there's any resonance
      if (Q > minQ) {
        // The peak gain of a resonant filter is approximately Q at the cutoff frequency
        // We want to keep the output roughly the same amplitude as the input
        const resonanceGain = Q / minQ // How much louder than flat response

        // Extra aggressive compensation at very low frequencies
        let compStrength = 0.8
        if (freqNorm < 0.02) {
          // Below 200 Hz, increase compensation strength exponentially
          compStrength = 0.8 + 0.15 * (1 - freqNorm / 0.02) ** 2
        }

        // More aggressive compensation at low frequencies where resonance is strongest
        const freqFactor = Math.max(0.2, Math.min(1, freqNorm * 3))

        // Calculate compensation to keep peaks under control
        // At maximum Q and low frequency, we want very significant gain reduction
        gainComp = 1 / (1 + (resonanceGain - 1) * compStrength * freqFactor)
      }

      // Additional low-cutoff gain compensation
      // At very low cutoff frequencies, reduce overall signal level
      // to simulate natural filter roll-off behavior
      let lowCutoffComp = 1
      if (this.cutSm < 200) {
        // Below 200 Hz, apply progressive gain reduction
        // At 20 Hz: 0% (complete silence)
        // At 200 Hz: full level
        const cutoffRatio = (this.cutSm - 20) / (200 - 20) // 0 to 1 from 20Hz to 200Hz
        const normalizedRatio = Math.max(0, cutoffRatio) // Ensure no negative values
        // Use a gentler curve: square root gives more usable range at low end
        lowCutoffComp = Math.sqrt(normalizedRatio)
      }

      // Combine all gain compensations
      const totalGainComp = gainComp * lowCutoffComp

      // Apply gain compensation and soft limit
      const lp = this._limit(s.lp * totalGainComp)
      const hp = this._limit(s.hp * totalGainComp)
      lpOut[i] = Number.isFinite(lp) ? lp : 0
      hpOut[i] = Number.isFinite(hp) ? hp : 0
    }

    return true
  }
}

registerProcessor('svf-filter-processor', SVFFilterProcessor)
