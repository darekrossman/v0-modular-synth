// Linear VCA tuned for 10 V = unity when cvAmount = 1.0.
// In0 = audio, In1 = CV (volts). Out0 = audio.
// Gain model (per-sample, smoothed):
//   gTarget = clamp01( offset + cvAmount * (max(cv, 0) / 10) )
//
// No inversion, purely attenuating CV. Hard mute below -90 dB to prevent bleed.

class VCAProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'offset',   defaultValue: 0,   minValue: 0,   maxValue: 1,  automationRate: 'k-rate' }, // base gain 0..1
      { name: 'cvAmount', defaultValue: 1,   minValue: 0,   maxValue: 1,  automationRate: 'k-rate' }, // attenuator 0..1
      { name: 'slewMs',   defaultValue: 1,   minValue: 0,   maxValue: 50, automationRate: 'k-rate' }, // smoothing (ms)
      { name: 'dcBlock',  defaultValue: 1,   minValue: 0,   maxValue: 1,  automationRate: 'k-rate' }, // 0/1
      { name: 'dcCutHz',  defaultValue: 5,   minValue: 0.1, maxValue: 40, automationRate: 'k-rate' },
      { name: 'hardGateDb', defaultValue: -90, minValue: -120, maxValue: -40, automationRate: 'k-rate' }, // mute threshold
      { name: 'sat',      defaultValue: 0.0, minValue: 0,   maxValue: 1,  automationRate: 'k-rate' }, // soft limiter mix (off by default)
    ]
  }

  constructor() {
    super()
    this.g = 0                // smoothed gain
    this.prevX = 0            // DC-block memory
    this.prevY = 0
    this.gated = true         // start muted
  }

  process(inputs, outputs, p) {
    const inA = (inputs[0] && inputs[0][0]) ? inputs[0][0] : null
    const inCV = (inputs[1] && inputs[1][0]) ? inputs[1][0] : null
    const out = outputs[0][0]
    const n = out.length

    const offset   = p.offset[0]   // 0..1 (direct base gain)
    const amount   = p.cvAmount[0] // 0..1 (attenuator, no inversion)
    const slewMs   = p.slewMs[0]
    const dcBlock  = (p.dcBlock[0] || 0) > 0.5
    const dcCutHz  = p.dcCutHz[0]
    const hardGateDb = p.hardGateDb[0]
    const satMix   = p.sat[0]

    const slewA = slewMs <= 0 ? 0 : Math.exp(-1 / (sampleRate * (slewMs / 1000)))
    const r = dcBlock ? Math.exp(-2 * Math.PI * dcCutHz / sampleRate) : 0

    // -90 dB (default) in linear
    const thLin = Math.pow(10, (hardGateDb || -90) / 20)
    const thHi = thLin * 2   // 6 dB hysteresis
    const thLo = thLin

    for (let i = 0; i < n; i++) {
      const x = inA ? inA[i] : 0
      const cv = inCV ? inCV[i] : 0

      // CV is volts; negative CV does not invert—clamp to 0
      const cvPos = cv > 0 ? cv : 0

      // 10 V at cvAmount=1.0 => +1.0 gain contribution
      let gTarget = offset + amount * (cvPos / 10)

      // clamp to 0..1
      gTarget = gTarget < 0 ? 0 : (gTarget > 1 ? 1 : gTarget)

      // hard gate with hysteresis to kill bleed
      if (this.gated) {
        if (gTarget >= thHi) this.gated = false
      } else {
        if (gTarget <= thLo) this.gated = true
      }
      if (this.gated) gTarget = 0

      // smooth for clickless changes
      this.g = (slewA === 0) ? gTarget : (gTarget + (this.g - gTarget) * slewA)

      // apply gain
      let y = x * this.g

      // optional soft limiter (defaults to 0/off)
      if (satMix > 0) {
        const k = 2.5
        const sat = Math.tanh(k * y) / Math.tanh(k)
        y = y * (1 - satMix) + sat * satMix
      }

      // DC-block to keep path pristine
      if (dcBlock) {
        const hp = y - this.prevX + r * this.prevY
        this.prevX = y
        this.prevY = hp
        y = hp
      }

      out[i] = y
    }
    return true
  }
}

registerProcessor('vca-processor', VCAProcessor)
