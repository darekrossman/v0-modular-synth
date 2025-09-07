// Input 0: 48 PPQ clock (0/5V) — rising edge ~2.5V
// Output 0: Gate (0/5V)
// Output 1: Pitch CV (Volts), 1V/oct; C4 = 0V ⇒ C3 = -1V
//
// One step = 1/16 note → 48/4 = 12 ticks/step; ticksPerStep = divider * 12
//
// Params (k-rate):
//   run        : 0/1
//   divider    : integer-ish ≥1
//   gateRatio  : 0..1  (fraction of current step length; 0.25 = 25% duty)
//   octave     : normalized 0..1 (mapped to 0..8) OR absolute 0..8
//
// Messages:
//   {type:'steps',   value:boolean[16]}
//   {type:'pitches', value:number[16]}  // 0..1, 0.5=center (C)
//   {type:'reset'}

class SequencerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'run',
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      },
      // divider is the direct step multiple: 1,2,4,8,16,32,64
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
        name: 'octave',
        defaultValue: 3,
        minValue: 0,
        maxValue: 8,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()
    this.STEPS = 16
    this.enable = new Array(this.STEPS).fill(false)
    this.pitches = new Array(this.STEPS).fill(0.5) // 0..1; 0.5=center (C)
    this.step = -1
    this.ppqCount = 0
    this.currentDivider = 1
    this.ticksPerStep = 12 // 1 * 12 ticks (48 PPQ / 4)
    this.pendingDivider = null

    // Gate countdown in samples
    this.gateCountSamples = 0
    this.hi = 5.0

    // Pitch CV (Volts). Start at C3 = -1V.
    this.currentPitch = -1

    // Gate LED state for UI
    this.gateOn = false
    this.gateStep = -1

    // Rising-edge tracking + tempo estimation
    this.lastClock = 0
    this.sampleCounter = 0
    this.lastTickSample = 0
    // Start with a reasonable guess (~120 BPM): ~10.4 ms/tick @ 48 PPQ
    this.samplesPerTick = (sampleRate * (60 / 120)) / 48
    this._lastReset = 0

    this.port.onmessage = (e) => {
      const { type, value } = e.data || {}
      if (
        type === 'steps' &&
        Array.isArray(value) &&
        value.length === this.STEPS
      ) {
        this.enable = value.map(Boolean)
      } else if (
        type === 'pitches' &&
        Array.isArray(value) &&
        value.length === this.STEPS
      ) {
        this.pitches = value.map((v) => {
          const f = Number.isFinite(v) ? v : 0.5
          return Math.max(0, Math.min(1, f))
        })
      } else if (type === 'reset') {
        this.ppqCount = 0
        this.gateCountSamples = 0
        this.step = -1
      }
    }
  }

  _resolveOctaveParam(octParam) {
    if (!Number.isFinite(octParam)) return 3
    if (octParam >= 0 && octParam <= 1.0001) return Math.round(octParam * 8) // normalized
    return Math.round(Math.max(0, Math.min(8, octParam))) // absolute
  }

  _advanceStep(ticksPerStep, baseOctaveAbs, gateRatio) {
    this.ppqCount++
    if (this.ppqCount >= this.ticksPerStep) {
      this.ppqCount = 0

      // Apply any pending divider change exactly at step boundary
      if (this.pendingDivider !== null) {
        this.currentDivider = this.pendingDivider
        this.ticksPerStep = this.currentDivider * 12
        this.pendingDivider = null
      }

      this.step = (this.step + 1) % this.STEPS

      if (this.enable[this.step]) {
        // --- Pitch: 1 V/oct with C4=0V -> C3=-1V
        const baseVolts = baseOctaveAbs - 4
        const k = this.pitches[this.step] ?? 0.5 // 0..1
        const stepOctaves = k - 0.5 // ±0.5 octaves (1 octave span)
        this.currentPitch = baseVolts + stepOctaves // final Volts
      }
      // If step is inactive, currentPitch remains unchanged (holds last active value)

      // --- Gate: fraction of step length in *samples*
      const stepSamples = Math.max(
        1,
        Math.floor(this.ticksPerStep * this.samplesPerTick),
      )
      const desired = Math.max(0, Math.min(1, gateRatio))
      const gateSamples = Math.max(1, Math.floor(stepSamples * desired))

      if (this.enable[this.step]) {
        this.gateCountSamples = gateSamples
        // Inform UI gate is on for this step
        this.gateOn = true
        this.gateStep = this.step
        this.port.postMessage({ type: 'gate', step: this.step, on: true })
      } else {
        this.gateOn = false
        this.gateStep = this.step
      }

      // Notify UI
      this.port.postMessage({ type: 'step', value: this.step })
    }
  }

  process(inputs, outputs, parameters) {
    const outGate = outputs[0][0]
    const outPitch = outputs[1][0]
    const n = outGate.length

    const run = (parameters.run[0] || 0) > 0.5
    // Treat divider as direct integer (1..64)
    const desiredDiv = Math.max(
      1,
      Math.min(64, Math.round(parameters.divider[0] || 1)),
    )
    const gateRatio = parameters.gateRatio[0] ?? 0.25
    if (desiredDiv !== this.currentDivider) this.pendingDivider = desiredDiv

    const octParam = parameters.octave[0]
    const baseOct = this._resolveOctaveParam(octParam)

    const in0 = inputs[0]?.[0] ? inputs[0][0] : null
    const inReset = inputs[1]?.[0] ? inputs[1][0] : null
    let last = this.lastClock

    for (let i = 0; i < n; i++) {
      const absIndex = this.sampleCounter + i

      // Reset detection on rising edge of reset input
      if (inReset) {
        const rv = inReset[i]
        const rising = (this._lastReset || 0) < 2.5 && rv >= 2.5
        if (rising) {
          this.ppqCount = 0
          this.gateCountSamples = 0
          this.step = -1
          this.gateOn = false
          this.gateStep = -1
        }
        this._lastReset = rv
      }

      if (!run) {
        outGate[i] = 0
        outPitch[i] = this.currentPitch
        continue
      }

      // Rising-edge detection + tempo estimation
      if (in0) {
        const v = in0[i]
        const rising = last < 2.5 && v >= 2.5
        if (rising) {
          // Update samplesPerTick with a light EMA for stability
          const delta = absIndex - this.lastTickSample
          if (delta > 0) {
            this.samplesPerTick = this.samplesPerTick * 0.85 + delta * 0.15
            this.lastTickSample = absIndex
          }
          this._advanceStep(this.ticksPerStep, baseOct, gateRatio)
        }
        last = v
      }

      // Gate envelope (samples domain, capped by step length via gateRatio)
      const gateActive = this.gateCountSamples > 0
      outGate[i] = gateActive ? this.hi : 0
      if (this.gateCountSamples > 0) this.gateCountSamples--
      // Post a single gate-off event when counter expires
      if (this.gateOn && this.gateCountSamples <= 0) {
        this.gateOn = false
        this.port.postMessage({ type: 'gate', step: this.gateStep, on: false })
      }

      outPitch[i] = this.currentPitch
    }

    this.lastClock = last
    this.sampleCounter += n
    return true
  }
}

registerProcessor('sequencer-processor', SequencerProcessor)
