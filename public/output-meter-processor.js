// output-meter-processor.js
class OutputMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._accL = 0
    this._accR = 0
    this._n = 0
    this._pL = 0
    this._pR = 0
    this._prevL = 0
    this._prevR = 0
    this._lastPost = 0
    this._clipTh = 0.98
    this._clipL = false
    this._clipR = false

    // Visual smoothing/hold state
    this._dispRmsL = 0
    this._dispRmsR = 0
    this._holdL = 0
    this._holdR = 0
    this._clipLDeadline = 0
    this._clipRDeadline = 0

    // Tunables
    this._alpha = 0.2 // RMS smoothing coefficient per UI frame (~30Hz)
    this._holdDecay = 0.015 // peak hold decay per UI frame
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length < 2) return true
    const L = input[0],
      R = input[1]
    let accL = this._accL,
      accR = this._accR,
      n = this._n
    let pL = this._pL,
      pR = this._pR
    let prevL = this._prevL,
      prevR = this._prevR
    let clipL = this._clipL,
      clipR = this._clipR

    const N = L.length
    for (let i = 0; i < N; i++) {
      const l = L[i],
        r = R[i]
      // accumulate RMS
      accL += l * l
      accR += r * r
      n++

      // simple 2× inter-sample peak using midpoint
      const midL = 0.5 * (prevL + l)
      const midR = 0.5 * (prevR + r)
      const aL = Math.max(Math.abs(l), Math.abs(midL))
      const aR = Math.max(Math.abs(r), Math.abs(midR))
      if (aL > pL) pL = aL
      if (aR > pR) pR = aR
      if (aL >= this._clipTh) clipL = true
      if (aR >= this._clipTh) clipR = true

      prevL = l
      prevR = r
    }

    const now = currentTime
    if (now - this._lastPost > 1 / 60) {
      const lInst = n > 0 ? Math.sqrt(accL / n) : 0
      const rInst = n > 0 ? Math.sqrt(accR / n) : 0

      // Smooth RMS
      this._dispRmsL = this._dispRmsL + (lInst - this._dispRmsL) * this._alpha
      this._dispRmsR = this._dispRmsR + (rInst - this._dispRmsR) * this._alpha

      // Peak hold decay
      this._holdL = Math.max(pL, this._holdL - this._holdDecay)
      this._holdR = Math.max(pR, this._holdR - this._holdDecay)

      // Clip latch
      if (clipL || pL >= this._clipTh) this._clipLDeadline = now + 0.75
      if (clipR || pR >= this._clipTh) this._clipRDeadline = now + 0.75
      const clipLActive = now < this._clipLDeadline
      const clipRActive = now < this._clipRDeadline

      // Send compact Float32Array [rmsL, rmsR, holdL, holdR, clipL, clipR]
      const out = new Float32Array(6)
      out[0] = this._dispRmsL
      out[1] = this._dispRmsR
      out[2] = this._holdL
      out[3] = this._holdR
      out[4] = clipLActive ? 1 : 0
      out[5] = clipRActive ? 1 : 0
      this.port.postMessage(out)

      // reset windows
      accL = 0
      accR = 0
      n = 0
      pL = 0
      pR = 0
      clipL = false
      clipR = false
      this._lastPost = now
    }

    this._accL = accL
    this._accR = accR
    this._n = n
    this._pL = pL
    this._pR = pR
    this._prevL = prevL
    this._prevR = prevR
    this._clipL = clipL
    this._clipR = clipR
    return true
  }
}
registerProcessor('output-meter', OutputMeterProcessor)
