// Emits five DC pulse streams: [0] = 48 PPQ, [1..4] = musical-grid triggers
// Each divider selects from: 1/32, 1/16, 1/8, 1/4, 1/2, 1/1, 2/1, 4/1, 8/1
// Control:
//   - AudioParam 'bpm'  (k-rate, 0.1..300)
//   - AudioParam 'div1' (k-rate, selector 0..8)
//   - AudioParam 'div2' (k-rate, selector 0..8)
//   - AudioParam 'div3' (k-rate, selector 0..8)
//   - AudioParam 'div4' (k-rate, selector 0..8)
//   - port messages: { type:'running', value:boolean }, { type:'reset' }

class ClockProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'bpm',
        defaultValue: 120,
        minValue: 0.1,
        maxValue: 300,
        automationRate: 'k-rate',
      },
      {
        name: 'div1',
        defaultValue: 3,
        minValue: 0,
        maxValue: 8,
        automationRate: 'k-rate',
      },
      {
        name: 'div2',
        defaultValue: 4,
        minValue: 0,
        maxValue: 8,
        automationRate: 'k-rate',
      },
      {
        name: 'div3',
        defaultValue: 5,
        minValue: 0,
        maxValue: 8,
        automationRate: 'k-rate',
      },
      {
        name: 'div4',
        defaultValue: 6,
        minValue: 0,
        maxValue: 8,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()
    this.running = false
    this.high = 5.0

    // phases/counters
    this.p = 0 // 48ppq phase in samples (0..ppqInt-1)
    this.ppqTick = 0 // running count of 48ppq ticks since start/reset

    // gate countdowns in samples
    this.ppqGate = 0
    this.divGates = [0, 0, 0, 0]

    this.lastBpm = 120

    this.port.onmessage = (e) => {
      const { type, value } = e.data || {}
      if (type === 'running') {
        const next = !!value
        if (next && !this.running) this._reset()
        this.running = next
      } else if (type === 'reset') {
        this._reset()
      }
    }
  }

  _reset() {
    this.p = 0
    this.ppqTick = 0
    this.ppqGate = 0
    this.divGates[0] =
      this.divGates[1] =
      this.divGates[2] =
      this.divGates[3] =
        0
  }

  _clamp(n, lo, hi) {
    if (hi < lo) return lo
    return n < lo ? lo : n > hi ? hi : n
  }

  _durations(bpm) {
    const sr = sampleRate
    const beat = Math.max(1, Math.floor(sr * (60 / bpm))) // samples per quarter
    const ppqInt = Math.max(1, Math.floor(beat / 48)) // samples per 48ppq tick

    // 48ppq pulse width
    const minPPQw = Math.floor(0.002 * sr) // >= 2 ms
    const maxPPQw = Math.max(1, Math.floor(ppqInt * 0.45))
    const wantPPQ = Math.floor(ppqInt * 0.25)
    const ppqW = this._clamp(wantPPQ, minPPQw, maxPPQw)

    return { beat, ppqInt, ppqW }
  }

  // map selector 0..8 -> ppqTick interval (in 48ppq ticks per pulse)
  _selToTickInterval(sel) {
    // pulses per quarter for selectors 0..8:
    // [8, 4, 2, 1, 1/2, 1/4, 1/8, 1/16, 1/32]
    // Convert to 48ppq ticks between pulses:
    // ticks = 48 / ppqPerQuarter
    const table = [6, 12, 24, 48, 96, 192, 384, 768, 1536]
    return table[this._clamp(sel | 0, 0, 8)]
  }

  // compute a good gate width (samples) for a given interval (samples)
  _gateWidthForInterval(intervalSamples) {
    const sr = sampleRate
    const minW = Math.floor(0.003 * sr) // >= 3 ms
    const want = Math.floor(intervalSamples * 0.25) // ~25% duty
    const maxW = Math.max(1, Math.floor(intervalSamples * 0.45))
    return this._clamp(want, minW, maxW)
  }

  process(inputs, outputs, parameters) {
    const out48 = outputs[0][0]
    const outDiv1 = outputs[1] ? outputs[1][0] : null
    const outDiv2 = outputs[2] ? outputs[2][0] : null
    const outDiv3 = outputs[3] ? outputs[3][0] : null
    const outDiv4 = outputs[4] ? outputs[4][0] : null
    const n = out48.length

    if (!this.running) {
      for (let i = 0; i < n; i++) {
        out48[i] = 0
        if (outDiv1) outDiv1[i] = 0
        if (outDiv2) outDiv2[i] = 0
        if (outDiv3) outDiv3[i] = 0
        if (outDiv4) outDiv4[i] = 0
      }
      return true
    }

    // parameters
    let bpm = parameters.bpm[0]
    if (!(bpm > 0) || !Number.isFinite(bpm)) bpm = this.lastBpm
    else this.lastBpm = bpm

    const sel = [
      this._clamp(Math.round(parameters.div1[0]), 0, 8),
      this._clamp(Math.round(parameters.div2[0]), 0, 8),
      this._clamp(Math.round(parameters.div3[0]), 0, 8),
      this._clamp(Math.round(parameters.div4[0]), 0, 8),
    ]

    const { beat, ppqInt, ppqW } = this._durations(bpm)

    // tick intervals (in 48ppq ticks) and corresponding sample intervals
    const tickIntervals = [
      this._selToTickInterval(sel[0]),
      this._selToTickInterval(sel[1]),
      this._selToTickInterval(sel[2]),
      this._selToTickInterval(sel[3]),
    ]
    const sampleIntervals = tickIntervals.map((t) => t * ppqInt)
    const gateWidths = sampleIntervals.map((iv) =>
      this._gateWidthForInterval(iv),
    )

    // local state
    let p = this.p
    let tick = this.ppqTick
    let ppqGate = this.ppqGate
    const divGates = this.divGates
    const hi = this.high

    for (let i = 0; i < n; i++) {
      // 48 PPQ: trigger at start of each tick
      if (p === 0) {
        ppqGate = ppqW
        tick++

        // Divider pulses on tick boundaries
        for (let k = 0; k < 4; k++) {
          if (tickIntervals[k] > 0 && tick % tickIntervals[k] === 0) {
            divGates[k] = gateWidths[k]
          }
        }
      }

      // write outputs
      out48[i] = ppqGate > 0 ? hi : 0
      if (outDiv1) outDiv1[i] = divGates[0] > 0 ? hi : 0
      if (outDiv2) outDiv2[i] = divGates[1] > 0 ? hi : 0
      if (outDiv3) outDiv3[i] = divGates[2] > 0 ? hi : 0
      if (outDiv4) outDiv4[i] = divGates[3] > 0 ? hi : 0

      // decay gates
      if (ppqGate > 0) ppqGate--
      for (let k = 0; k < 4; k++) if (divGates[k] > 0) divGates[k]--

      // advance ppq sample phase
      p++
      if (p >= ppqInt) p = 0
    }

    // persist
    this.p = p
    this.ppqTick = tick
    this.ppqGate = ppqGate
    this.divGates[0] = divGates[0]
    this.divGates[1] = divGates[1]
    this.divGates[2] = divGates[2]
    this.divGates[3] = divGates[3]
    return true
  }
}

registerProcessor('clock-processor', ClockProcessor)
