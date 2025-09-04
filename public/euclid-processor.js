// Euclidean Sequencer Processor
// Input 0: 48 PPQ clock (0/5V) — rising edge around 2.5V
// Input 1: Reset gate (0/5V) — rising edge resets to step -1
// Input 2: Pulses CV (0..5V) — overrides pulses count (0..steps)
// Input 3: Rotate CV (0..5V) — overrides rotation (0..steps-1)
// Input 4: Density CV (0..5V) — scales probability (0..1)
// Input 5: Accent CV (0..5V) — scales accent probability (0..1)
// Output 0: Gate (0/5V)
// Output 1: Accent (0/5V)
//
// Step duration: divider * 12 ticks of 48 PPQ (1 step = 1/16 note at divider=1)
// Parameters (k-rate):
//   run        : 0/1
//   divider    : integer-ish ≥1
//   gateRatio  : 0..1   (fraction of step length)
//   steps      : 1..16  (sequence length)
//   pulsesNorm : 0..1   (mapped to 0..steps) unless CV overrides
//   rotateNorm : 0..1   (mapped to 0..steps-1) unless CV overrides
//   density    : 0..1   (probability of firing on a pulse step)
//   accent     : 0..1   (probability that a firing pulse is accented)

class EuclidProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'run',
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'divider',
        defaultValue: 1,
        minValue: 1,
        maxValue: 64,
        automationRate: 'k-rate',
      },
      {
        name: 'gateRatio',
        defaultValue: 0.25,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'steps',
        defaultValue: 8,
        minValue: 1,
        maxValue: 16,
        automationRate: 'k-rate',
      },
      {
        name: 'pulsesNorm',
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'rotateNorm',
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'density',
        defaultValue: 1.0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      {
        name: 'accent',
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()

    this.hi = 5.0

    // clock state
    this.lastClock = 0
    this.sampleCounter = 0
    this.lastTickSample = 0
    this.samplesPerTick = (sampleRate * (60 / 120)) / 48 // start ~120 BPM as guess

    // step timing
    this.ppqCount = 0
    this.currentDivider = 1
    this.pendingDivider = null
    this.ticksPerStep = 12 // divider * 12 (set on change)

    // sequence/pattern state
    this.step = -1
    this.stepsLen = 8
    this.pulses = 4
    this.rotate = 0
    this.pattern = this._computePattern(this.stepsLen, this.pulses, this.rotate)

    // gate countdown in samples
    this.gateCountSamples = 0
    this.accGateCountSamples = 0

    // UI feedback state
    this.gateOn = false
    this.gateStep = -1

    this.port.onmessage = (e) => {
      const { type } = e.data || {}
      if (type === 'reset') {
        this.ppqCount = 0
        this.step = -1
        this.gateCountSamples = 0
        this.gateOn = false
        this.gateStep = -1
      }
    }
  }

  // Euclidean pattern via Bjorklund algorithm; returns booleans array of length n
  _computePattern(n, k, r) {
    n = Math.max(1, Math.floor(n))
    k = Math.max(0, Math.min(n, Math.floor(k)))
    r = Math.max(0, Math.min(Math.max(0, n - 1), Math.floor(r)))
    if (k === 0) return Array(n).fill(false)
    if (k === n) return Array(n).fill(true)

    // Build two arrays: k ones and n-k zeros
    const counts = []
    const remainders = []
    let divisor = n - k
    remainders.push(k)
    let level = 0
    while (true) {
      counts.push(Math.floor(divisor / remainders[level]))
      remainders.push(divisor % remainders[level])
      divisor = remainders[level]
      level++
      if (remainders[level] <= 1) break
    }
    counts.push(divisor)

    const pattern = []
    const build = (lvl) => {
      if (lvl === -1) {
        pattern.push(false)
      } else if (lvl === -2) {
        pattern.push(true)
      } else {
        for (let i = 0; i < counts[lvl]; i++) build(lvl - 1)
        if (remainders[lvl] !== 0) build(lvl - 2)
      }
    }
    build(level)

    // Flatten pattern (it can be nested arrays mixed), ensure booleans
    const flat = []
    const flatten = (arr) => {
      for (const x of arr) {
        if (Array.isArray(x)) flatten(x)
        else flat.push(!!x)
      }
    }
    flatten(pattern)
    // Ensure exact length n; if longer, slice; if shorter, pad false
    let out = flat.slice(0, n)
    while (out.length < n) out.push(false)

    // rotate by r (right rotation)
    if (r > 0 && n > 1) {
      const rr = r % n
      out = out.slice(n - rr).concat(out.slice(0, n - rr))
    }
    return out
  }

  _resolveInts(params, inputs) {
    // Resolve steps integer (1..16) from param only
    const steps = Math.max(1, Math.min(16, Math.round(params.steps[0] || 1)))

    // Helper: read 0..1 CV only if the input carries a non-zero signal this block
    const readCv01 = (slot) => {
      if (!inputs[slot]?.[0]) return null
      const ch = inputs[slot][0]
      const n = ch.length | 0
      let active = false
      for (let i = 0; i < n; i++) {
        const a = ch[i]
        if (a > 1e-5 || a < -1e-5) {
          active = true
          break
        }
      }
      if (!active) return null
      const v = ch[0]
      return NumberisFinite(v) ? Math.max(0, Math.min(1, v / 5)) : null
    }

    // Pulses: prefer CV if active, else from pulsesNorm
    const pulsesCv01 = readCv01(2)
    const pulsesCv = pulsesCv01 == null ? null : Math.round(pulsesCv01 * steps)
    let pulses = pulsesCv
    if (pulses == null) {
      const pNorm = params.pulsesNorm[0] ?? 0
      pulses = Math.round(Math.max(0, Math.min(1, pNorm)) * steps)
    }
    pulses = Math.max(0, Math.min(steps, pulses | 0))

    // Rotate: prefer CV if active, else from rotateNorm
    const rotateCv01 = readCv01(3)
    const rotateCv =
      rotateCv01 == null
        ? null
        : Math.round(rotateCv01 * Math.max(0, steps - 1))
    let rotate = rotateCv
    if (rotate == null) {
      const rNorm = params.rotateNorm[0] ?? 0
      rotate = Math.round(
        Math.max(0, Math.min(1, rNorm)) * Math.max(0, steps - 1),
      )
    }
    rotate = Math.max(0, Math.min(Math.max(0, steps - 1), rotate | 0))

    // Density: multiply base density by CV (0..1 * 0..1) only if CV active
    let density = params.density[0] ?? 1
    const densCv01 = readCv01(4)
    if (densCv01 != null) density = Math.max(0, Math.min(1, density * densCv01))

    return { steps, pulses, rotate, density }
  }

  _maybeRecomputePattern(steps, pulses, rotate) {
    if (
      steps !== this.stepsLen ||
      pulses !== this.pulses ||
      rotate !== this.rotate
    ) {
      this.stepsLen = steps
      this.pulses = pulses
      this.rotate = rotate
      this.pattern = this._computePattern(steps, pulses, rotate)
    }
  }

  _advanceStep(gateRatio, density, accentProb) {
    this.ppqCount++
    if (this.ppqCount >= this.ticksPerStep) {
      this.ppqCount = 0

      // Apply pending divider change exactly at step boundary
      if (this.pendingDivider !== null) {
        this.currentDivider = this.pendingDivider
        this.ticksPerStep = this.currentDivider * 12
        this.pendingDivider = null
      }

      // advance
      this.step = (this.step + 1) % this.stepsLen

      // compute gate length in samples
      const stepSamples = Math.max(
        1,
        Math.floor(this.ticksPerStep * this.samplesPerTick),
      )
      const desired = Math.max(0, Math.min(1, gateRatio))
      const gateSamples = Math.max(1, Math.floor(stepSamples * desired))

      const active = this.pattern[this.step]
      let fire = active
      if (active && density < 0.999) {
        fire = Math.random() < density
      }

      if (fire) {
        this.gateCountSamples = gateSamples
        // Accent decision happens only on fired step
        const accented = Math.random() < Math.max(0, Math.min(1, accentProb))
        this.accGateCountSamples = accented ? gateSamples : 0
        this.gateOn = true
        this.gateStep = this.step
        this.port.postMessage({ type: 'gate', step: this.step, on: true })
      } else {
        this.gateOn = false
        this.gateStep = this.step
        this.accGateCountSamples = 0
      }

      this.port.postMessage({ type: 'step', value: this.step })
    }
  }

  process(inputs, outputs, parameters) {
    const outGate = outputs[0][0]
    const outAcc = outputs[1] ? outputs[1][0] : null
    const n = outGate.length

    const run = (parameters.run[0] || 0) > 0.5
    const desiredDiv = Math.max(
      1,
      Math.min(64, Math.round(parameters.divider[0] || 1)),
    )
    const gateRatio = parameters.gateRatio[0] ?? 0.25
    if (desiredDiv !== this.currentDivider) this.pendingDivider = desiredDiv

    // Resolve steps/pulses/rotate/density, recompute pattern if needed
    const { steps, pulses, rotate, density } = this._resolveInts(
      parameters,
      inputs,
    )
    // Accent probability from param with CV scaling
    let accentProb = parameters.accent[0] ?? 0.5
    const accCv01 = ((slot) => {
      if (!inputs[slot]?.[0]) return null
      const ch = inputs[slot][0]
      const n = ch.length | 0
      for (let i = 0; i < n; i++) {
        const a = ch[i]
        if (a > 1e-5 || a < -1e-5) {
          return Math.max(0, Math.min(1, (ch[0] || 0) / 5))
        }
      }
      return null
    })(5)
    if (accCv01 != null)
      accentProb = Math.max(0, Math.min(1, accentProb * accCv01))
    this._maybeRecomputePattern(steps, pulses, rotate)

    const inClock = inputs[0]?.[0] ? inputs[0][0] : null
    const inReset = inputs[1]?.[0] ? inputs[1][0] : null

    let last = this.lastClock
    for (let i = 0; i < n; i++) {
      const absIndex = this.sampleCounter + i

      // reset detection (rising edge)
      if (inReset) {
        const rv = inReset[i]
        if (this._isRising(this._lastReset || 0, rv)) {
          this.ppqCount = 0
          this.step = -1
          this.gateCountSamples = 0
          this.gateOn = false
        }
        this._lastReset = rv
      }

      if (!run) {
        outGate[i] = 0
        continue
      }

      if (inClock) {
        const v = inClock[i]
        const rising = this._isRising(last, v)
        if (rising) {
          // tempo estimate
          const delta = absIndex - this.lastTickSample
          if (delta > 0) {
            this.samplesPerTick = this.samplesPerTick * 0.85 + delta * 0.15
            this.lastTickSample = absIndex
          }
          this._advanceStep(gateRatio, density, accentProb)
        }
        last = v
      }

      // write gate and decay counter
      const gateActive = this.gateCountSamples > 0
      outGate[i] = gateActive ? this.hi : 0
      if (outAcc) outAcc[i] = this.accGateCountSamples > 0 ? this.hi : 0
      if (this.gateCountSamples > 0) this.gateCountSamples--
      if (this.accGateCountSamples > 0) this.accGateCountSamples--
      if (this.gateOn && this.gateCountSamples <= 0) {
        this.gateOn = false
        this.port.postMessage({ type: 'gate', step: this.gateStep, on: false })
      }
    }

    this.lastClock = last
    this.sampleCounter += n
    return true
  }

  _isRising(prev, curr) {
    return prev < 2.5 && curr >= 2.5
  }
}

registerProcessor('euclid-processor', EuclidProcessor)
