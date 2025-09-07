// Process Processor
// Inputs: [0]=IN (cv), [1]=GATE (cv), [2]=SLEW CV (cv)
// Outputs: [0]=S&H1, [1]=S&H2, [2]=T&H, [3]=H&T, [4]=SLEW, [5]=GLIDE
// Param: slewMsPerV (ms per volt); higher -> slower

class ProcessProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'slewMsPerV',
        defaultValue: 50,
        minValue: 0,
        maxValue: 1000,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()
    // state
    this.sh1 = 0
    this.sh2 = 0
    this.th = 0
    this.ht = 0
    this.ySlew = 0
    this.yGlide = 0
    this.lastGate = 0
    this.glideDelay = 0 // samples remaining before GLIDE engages after rising edge
  }

  _applySlew(current, target, maxDelta) {
    if (maxDelta === Infinity) return target
    const d = target - current
    if (d > maxDelta) return current + maxDelta
    if (d < -maxDelta) return current - maxDelta
    return target
  }

  process(inputs, outputs, parameters) {
    const inSig = inputs[0]?.[0]
    const gateIn = inputs[1]?.[0]
    const slewCv = inputs[2]?.[0]

    const outSH1 = outputs[0]?.[0]
    const outSH2 = outputs[1]?.[0]
    const outTH = outputs[2]?.[0]
    const outHT = outputs[3]?.[0]
    const outSlew = outputs[4]?.[0]
    const outGlide = outputs[5]?.[0]

    const n = (outSH1 || outTH || outSlew || outGlide)?.length || 128

    let sh1 = this.sh1
    let sh2 = this.sh2
    let th = this.th
    let ht = this.ht
    let ySlew = this.ySlew
    let yGlide = this.yGlide
    let lastG = this.lastGate
    let glideDelay = this.glideDelay

    for (let i = 0; i < n; i++) {
      const x = inSig ? inSig[i] : 0
      const g = gateIn ? gateIn[i] : 0
      const gateHigh = g > 0.5
      const rising = gateHigh && !(lastG > 0.5)

      // On rising edge: update shift register and arm glide delay
      if (rising) {
        sh2 = sh1
        sh1 = x
        // 1 ms delay before GLIDE engages slew-limiting after gate goes high
        glideDelay = Math.max(1, Math.ceil(0.001 * sampleRate))
      }

      // Track-and-hold (hold when gate high)
      if (!gateHigh) th = x
      // Hold-and-track (hold when gate low)
      if (gateHigh) ht = x

      // Effective slew amount (ms/V) with CV offset
      let msPerV = parameters.slewMsPerV[0]
      if (slewCv) msPerV += slewCv[i] * 100 // ±10V -> ±1000ms/V
      if (msPerV < 0) msPerV = 0
      if (msPerV > 1000) msPerV = 1000
      const maxDelta = msPerV <= 0 ? Infinity : 1000 / (msPerV * sampleRate)

      // SLEW output: track when gate high, slew-limit when gate low
      if (gateHigh) ySlew = x
      else ySlew = this._applySlew(ySlew, x, maxDelta)

      // GLIDE output: inverse; slew when gate high (after 1ms), track when low
      const glideActive = gateHigh && glideDelay <= 0
      if (glideActive) yGlide = this._applySlew(yGlide, x, maxDelta)
      else yGlide = x
      if (glideDelay > 0) glideDelay--

      if (outSH1) outSH1[i] = sh1
      if (outSH2) outSH2[i] = sh2
      if (outTH) outTH[i] = th
      if (outHT) outHT[i] = ht
      if (outSlew) outSlew[i] = ySlew
      if (outGlide) outGlide[i] = yGlide

      lastG = g
    }

    // persist state
    this.sh1 = sh1
    this.sh2 = sh2
    this.th = th
    this.ht = ht
    this.ySlew = ySlew
    this.yGlide = yGlide
    this.lastGate = lastG
    this.glideDelay = glideDelay
    return true
  }
}

registerProcessor('process-processor', ProcessProcessor)
