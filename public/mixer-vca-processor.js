// Mixer VCA Processor
// - 4 independent VCA channels plus a final mix VCA
// - Inputs 0..3: channel audio inputs (mono)
// - Inputs 4..7: channel CV inputs (0..10 V). If disconnected, treated as 10 V (unity)
// - Input 8: mix CV input (0..10 V). If disconnected, treated as 10 V (unity)
// - Outputs 0..3: per-channel VCA outputs
// - Output 4: final mix output (sum of channels passed through mix VCA)
//
// Gain model per channel:
//   v = max(cv, 0)  // clamp negative CV
//   gLinear = clamp01(chOffset + chAmount * (v / 10))
//   g = expo ? expoCurve(gLinear) : gLinear
//   y = x * smooth(g)
//
// Mix VCA:
//   vMix = max(cvMix, 0)
//   gMixLinear = clamp01(mixOffset + mixAmount * (vMix / 10))
//   gMix = expo ? expoCurve(gMixLinear) : gMixLinear
//   outMix = (y0 + y1 + y2 + y3) * smooth(gMix)

class MixerVCAProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    // Per-channel offsets (0..1) and amounts (0..1)
    const params = []
    for (let i = 0; i < 4; i++) {
      params.push({
        name: `ch${i}Offset`,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      params.push({
        name: `ch${i}Amount`,
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      // Post-VCA mix gain for this channel (controls contribution to final mix only)
      params.push({
        name: `ch${i}Mix`,
        defaultValue: 0.75, // 0.75 => unity (1.0x), 1.0 => 2.0x (+6 dB)
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
    }
    // Mix controls
    params.push({
      name: 'mixOffset',
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'mixAmount',
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    // Post-VCA master mix gain knob (0..1 mapped to 0..2x; 0.5 => 1x)
    params.push({
      name: 'mixKnob',
      defaultValue: 0.5,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    // Mode / behavior
    params.push({
      name: 'expo',
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'slewMs',
      defaultValue: 1,
      minValue: 0,
      maxValue: 50,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'dcBlock',
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'dcCutHz',
      defaultValue: 5,
      minValue: 0.1,
      maxValue: 40,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'hardGateDb',
      defaultValue: -90,
      minValue: -120,
      maxValue: -40,
      automationRate: 'k-rate',
    })
    return params
  }

  constructor() {
    super()
    // Smoothed gains for channels and mix
    this.gCh = [0, 0, 0, 0]
    this.gMix = 0
    // DC-block state per output (4 channels + mix)
    this.prevX = new Float32Array(5)
    this.prevY = new Float32Array(5)
    // Gates per channel and for mix
    this.gatedCh = [true, true, true, true]
    this.gatedMix = true
  }

  expoCurve(x) {
    // 0..1 -> 0..1 with exponential curvature; k controls steepness
    const k = 5
    const e = Math.exp(k)
    return (Math.exp(k * x) - 1) / (e - 1)
  }

  process(inputs, outputs, p) {
    const out0 = outputs[0]
    if (!out0) return true
    // Mono per output
    const oCh = [outputs[0][0], outputs[1][0], outputs[2][0], outputs[3][0]]
    const oMix = outputs[4][0]
    const n = oMix ? oMix.length : oCh[0].length

    // Params
    const expo = (p.expo[0] || 0) > 0.5
    const slewMs = p.slewMs[0]
    const dcBlock = (p.dcBlock[0] || 0) > 0.5
    const dcCutHz = p.dcCutHz[0]
    const hardGateDb = p.hardGateDb[0]

    const slewA =
      slewMs <= 0 ? 0 : Math.exp(-1 / (sampleRate * (slewMs / 1000)))
    const r = dcBlock ? Math.exp((-2 * Math.PI * dcCutHz) / sampleRate) : 0
    const thLin = 10 ** ((hardGateDb || -90) / 20)
    const thHi = thLin * 2
    const thLo = thLin

    for (let i = 0; i < n; i++) {
      let mixSum = 0

      for (let ch = 0; ch < 4; ch++) {
        const x = inputs[ch]?.[0] ? inputs[ch][0][i] : 0
        // If CV input is not connected, treat as 10 V (unity)
        const cvFrame = inputs[4 + ch]?.[0] ? inputs[4 + ch][0][i] : 10
        const cvPos = cvFrame > 0 ? cvFrame : 0

        const offset = p[`ch${ch}Offset`][0]
        const amount = p[`ch${ch}Amount`][0]
        const mixGain = p[`ch${ch}Mix`][0]

        let gTarget = offset + amount * (cvPos / 10)
        // clamp
        gTarget = gTarget < 0 ? 0 : gTarget > 1 ? 1 : gTarget
        if (expo) gTarget = this.expoCurve(gTarget)

        // hard gate with hysteresis
        if (this.gatedCh[ch]) {
          if (gTarget >= thHi) this.gatedCh[ch] = false
        } else {
          if (gTarget <= thLo) this.gatedCh[ch] = true
        }
        if (this.gatedCh[ch]) gTarget = 0

        // smooth
        const gSm =
          slewA === 0 ? gTarget : gTarget + (this.gCh[ch] - gTarget) * slewA
        this.gCh[ch] = gSm

        let y = x * gSm

        // optional DC-block per channel output
        if (dcBlock) {
          const idx = ch
          const hp = y - this.prevX[idx] + r * this.prevY[idx]
          this.prevX[idx] = y
          this.prevY[idx] = hp
          y = hp
        }

        oCh[ch][i] = y
        // Map channel mix 0..1 so that:
        // - 0.75 => 1x (unity)
        // - 1.00 => 2x (+6 dB)
        // - 0.00 => 0x (mute)
        // Piecewise-linear mapping: [0..0.75] -> [0..1], [0.75..1] -> [1..2]
        const chScalar =
          mixGain <= 0.75 ? mixGain / 0.75 : 1 + (mixGain - 0.75) * 4
        // Post-VCA per-channel mix gain affects only the final mix bus
        mixSum += y * chScalar
      }

      // Mix VCA
      const mixInputConnected = !!inputs[8]?.[0]
      const mixCV = mixInputConnected ? inputs[8][0][i] : 10
      const mixCvPos = mixCV > 0 ? mixCV : 0
      const mixOffset = p.mixOffset[0]
      const mixAmount = p.mixAmount[0]

      // If CV is connected, it solely controls the VCA level: 0 => silent, 10V => fully open.
      // If not connected, normalize to 10V and include offset as base level.
      let gMixTarget = mixInputConnected
        ? mixAmount * (mixCvPos / 10)
        : mixOffset + mixAmount * (mixCvPos / 10)
      gMixTarget = gMixTarget < 0 ? 0 : gMixTarget > 1 ? 1 : gMixTarget
      if (expo) gMixTarget = this.expoCurve(gMixTarget)

      if (this.gatedMix) {
        if (gMixTarget >= thHi) this.gatedMix = false
      } else {
        if (gMixTarget <= thLo) this.gatedMix = true
      }
      if (this.gatedMix) gMixTarget = 0

      const gMixSm =
        slewA === 0 ? gMixTarget : gMixTarget + (this.gMix - gMixTarget) * slewA
      this.gMix = gMixSm

      // Map mixKnob 0..1 -> 0..2 (0.5 => 1x; 1.0 => 2x ~ +6 dB)
      const mixKnob = p.mixKnob[0]
      const mixScalar = 2 * mixKnob
      let yMix = mixSum * gMixSm * mixScalar
      if (dcBlock) {
        const idx = 4
        const hp = yMix - this.prevX[idx] + r * this.prevY[idx]
        this.prevX[idx] = yMix
        this.prevY[idx] = hp
        yMix = hp
      }
      oMix[i] = yMix
    }

    return true
  }
}

registerProcessor('mixer-vca-processor', MixerVCAProcessor)
