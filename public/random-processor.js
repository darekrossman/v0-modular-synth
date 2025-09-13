// random-processor.js
// 8-channel random CV generator with normalled triggers.
//
// Inputs (8): trigger signals (expecting ~0V low, ~5V high)
// Outputs (8): DC CV (held) per channel
//
// Params (k-rate):
//  - atten1..atten8: 0..1 (scales random span; 1.0 → ±5 V max before offset)
//  - offset1..offset8: -5..+5 V (added after attenuation)
// Port messages:
//  - { type: 'reset' } : re-seed each channel with a new random value

class RandomProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const atten = (name) => ({
      name,
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    const offset = (name) => ({
      name,
      defaultValue: 0,
      minValue: -5,
      maxValue: 5,
      automationRate: 'k-rate',
    })
    return [
      atten('atten1'),
      offset('offset1'),
      atten('atten2'),
      offset('offset2'),
      atten('atten3'),
      offset('offset3'),
      atten('atten4'),
      offset('offset4'),
      atten('atten5'),
      offset('offset5'),
      atten('atten6'),
      offset('offset6'),
      atten('atten7'),
      offset('offset7'),
      atten('atten8'),
      offset('offset8'),
    ]
  }

  constructor() {
    super()
    this.THRESH = 2.5 // volts – rising edge threshold (matches your 5V gates)

    // last input samples (effective, after normalled logic)
    this._lastIn = new Float32Array(8)

    // held random values in volts (–5..+5)
    this._held = new Float32Array(8)
    for (let i = 0; i < 8; i++) this._held[i] = this._rnd()

    this.port.onmessage = (e) => {
      if (e?.data?.type === 'reset') {
        for (let i = 0; i < 8; i++) this._held[i] = this._rnd()
      }
    }
  }

  _rnd() {
    // –5..+5 V
    return (Math.random() * 2 - 1) * 5
  }

  process(inputs, outputs, parameters) {
    // inputs[k] might be [], treat as 0
    // outputs[k][0] is the mono channel for CV
    const out = outputs

    // fetch k-rate params once
    const att = [
      parameters.atten1[0],
      parameters.offset1[0],
      parameters.atten2[0],
      parameters.offset2[0],
      parameters.atten3[0],
      parameters.offset3[0],
      parameters.atten4[0],
      parameters.offset4[0],
      parameters.atten5[0],
      parameters.offset5[0],
      parameters.atten6[0],
      parameters.offset6[0],
      parameters.atten7[0],
      parameters.offset7[0],
      parameters.atten8[0],
      parameters.offset8[0],
    ]

    // Sample frames per quantum
    const n = out[0][0].length

    for (let i = 0; i < n; i++) {
      // Read input1 sample (used for normalled logic)
      const s1 = inputs[0]?.[0] ? inputs[0][0][i] : 0

      for (let ch = 0; ch < 8; ch++) {
        // source sample from this input
        let s = inputs[ch]?.[0] ? inputs[ch][0][i] : 0

        // NORMALLED: if channel ch has (near) zero while input 1 has signal,
        // treat the effective input as input1. This covers "no cable" nicely
        // in a patching environment where silence = 0.0.
        if (ch > 0 && Math.abs(s) < 1e-6 && Math.abs(s1) > 1e-6) s = s1

        // rising edge detect vs 2.5 V
        const prev = this._lastIn[ch]
        if (prev <= this.THRESH && s > this.THRESH) {
          this._held[ch] = this._rnd()
        }
        this._lastIn[ch] = s

        // apply atten + offset, clamp to ±10 V for safety
        const a = att[ch * 2 + 0] // 0..1
        const o = att[ch * 2 + 1] // -5..+5
        let v = this._held[ch] * a + o
        if (v > 10) v = 10
        else if (v < -10) v = -10

        // write DC sample (per-sample to be compatible with downstream processing)
        out[ch][0][i] = v
      }
    }

    return true
  }
}

registerProcessor('random-processor', RandomProcessor)
