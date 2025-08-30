// /public/delay-processor.js
// Stereo/Mono/Ping-Pong delay with k-rate params and audio-rate CV for Time & Feedback.
// Inputs:
//   in[0]: 2ch audio (L,R)
//   in[1]: 1ch time CV  (-1..+1)
//   in[2]: 1ch feedback CV (-1..+1)
//   in[3]: 1ch clock input (pulses). Rising edges define clock period.
// Output:
//   out[0]: 2ch audio (L,R)

const TIME_MIN = 0.01;
const TIME_MAX = 2.0;
const FB_MAX   = 0.95;

class DelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "time",      defaultValue: 0.25, minValue: TIME_MIN, maxValue: TIME_MAX, automationRate: "k-rate" }, // seconds
      { name: "feedback",  defaultValue: 0.30, minValue: 0.0,      maxValue: FB_MAX,   automationRate: "k-rate" },
      { name: "mix",       defaultValue: 0.50, minValue: 0.0,      maxValue: 1.0,      automationRate: "k-rate" },
      { name: "toneHz",    defaultValue: 8000, minValue: 200,      maxValue: 16000,    automationRate: "k-rate" }, // LPF in feedback
      // 0 = MONO, 1 = STEREO, 2 = PING_PONG
      { name: "mode",      defaultValue: 0,    minValue: 0,        maxValue: 2,        automationRate: "k-rate" },
      // CV depths (0..1). CV signals are expected in [-1..+1].
      { name: "timeCvAmt", defaultValue: 0.0,  minValue: 0.0,      maxValue: 1.0,      automationRate: "k-rate" },
      { name: "fbCvAmt",   defaultValue: 0.0,  minValue: 0.0,      maxValue: 1.0,      automationRate: "k-rate" },
      // Clocked mode: if enabled, delay time follows measured clock period * clockMult
      { name: "clocked",   defaultValue: 0.0,  minValue: 0.0,      maxValue: 1.0,      automationRate: "k-rate" },
      { name: "clockMult", defaultValue: 1.0,  minValue: 0.0,      maxValue: 1.0,      automationRate: "k-rate" },
      // Dry mono balance: when enabled, dry path uses mono sum for both channels
      { name: "dryMono",   defaultValue: 0.0,  minValue: 0.0,      maxValue: 1.0,      automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();

    this.sr = sampleRate;

    // Max buffer: TIME_MAX + a little guard
    this.cap = Math.max(2048, Math.ceil((TIME_MAX + 0.05) * this.sr) + 4);
    this.bufL = new Float32Array(this.cap);
    this.bufR = new Float32Array(this.cap);
    this.w = 0;

    // Feedback LPF states
    this.lpfL = 0;
    this.lpfR = 0;

    // Smoothed params (for zipper-free behavior even if host jumps)
    this.tZ = 0.25;  // seconds
    this.fbZ = 0.3;  // 0..FB_MAX
    this.mixZ = 0.5; // 0..1
    this.aParam = 1 - Math.exp(-1 / (this.sr * 0.02)); // ~20ms

    this.toneAlpha = 1 - Math.exp(-2 * Math.PI * 8000 / this.sr); // set each block

    // Clock detection state
    this.clockLastVal = 0.0;
    this.lastEdgeSampleIndex = -1; // global sample index of last rising edge
    this.clockPeriodSamples = 0;   // measured period in samples
    this.globalSampleIndex = 0;    // running sample counter across blocks
  }

  // ring read with linear interpolation (pos can be fractional, relative to absolute write index)
  _read(buf, w, delaySamples) {
    let pos = w - delaySamples;
    while (pos < 0) pos += this.cap; // wrap backward
    // pos in [0..cap)
    const i0 = (pos | 0);
    const frac = pos - i0;
    const i1 = (i0 + 1) % this.cap;
    const s0 = buf[i0];
    const s1 = buf[i1];
    return s0 + (s1 - s0) * frac;
  }

  process(inputs, outputs, params) {
    const out = outputs[0];
    if (!out || out.length < 2) return true;

    const outL = out[0];
    const outR = out[1];
    const N = outL.length;

    // Inputs:
    const inA = inputs[0] || []; // stereo audio
    const inL = inA[0] || null;
    const inR = inA[1] || null;

    const inTimeCv = (inputs[1] && inputs[1][0]) ? inputs[1][0] : null;
    const inFbCv   = (inputs[2] && inputs[2][0]) ? inputs[2][0] : null;
    const inClock  = (inputs[3] && inputs[3][0]) ? inputs[3][0] : null;

    // k-rate params for this block
    const baseTime   = params.time[0];
    const baseFb     = params.feedback[0];
    const baseMix    = params.mix[0];
    const toneHz     = params.toneHz[0];
    const mode       = (params.mode[0] | 0) % 3;
    const timeCvAmt  = params.timeCvAmt[0]; // 0..1
    const fbCvAmt    = params.fbCvAmt[0];   // 0..1
    const clocked    = params.clocked[0] >= 0.5;
    const clockMult  = params.clockMult[0];
    const dryMono    = params.dryMono[0] >= 0.5;

    // Update tone LPF coefficient once per block
    this.toneAlpha = 1 - Math.exp(-2 * Math.PI * Math.max(10, toneHz) / this.sr);

    // smooth static params toward base
    const aP = this.aParam;

    // precompute span used to scale CV → seconds/gain
    const timeSpan = (TIME_MAX - TIME_MIN) * 0.5;
    const fbSpan   = FB_MAX * 0.5;

    // Determine clock-derived time (use period measured up to previous block)
    let clockTimeSec = null;
    if (clocked && this.clockPeriodSamples > 0) {
      clockTimeSec = (this.clockPeriodSamples / this.sr) * Math.max(0, clockMult);
      // clamp to safe bounds
      if (clockTimeSec < TIME_MIN) clockTimeSec = TIME_MIN;
      if (clockTimeSec > TIME_MAX) clockTimeSec = TIME_MAX;
    }

    // We'll use equal-power mix (per-sample mixZ for accuracy when modulated)
    for (let i = 0; i < N; i++) {
      const xL = inL ? inL[i] : 0;
      const xR = inR ? inR[i] : 0;

      // audio-rate CV samples (expected -1..+1)
      const tCv = inTimeCv ? inTimeCv[i] : 0;
      const fCv = inFbCv   ? inFbCv[i]   : 0;
      const cIn = inClock  ? inClock[i]  : 0;

      // effective targets with CV & hard clamp
      let tEff  = clockTimeSec != null
        ? clockTimeSec
        : (baseTime + (tCv * timeCvAmt) * timeSpan);
      if (tEff < TIME_MIN) tEff = TIME_MIN;
      if (tEff > TIME_MAX) tEff = TIME_MAX;

      let fbEff = baseFb + (fCv * fbCvAmt) * fbSpan;
      if (fbEff < 0) fbEff = 0;
      if (fbEff > FB_MAX) fbEff = FB_MAX;

      // smooth parameters a bit (in-worklet, so UI doesn’t have to)
      this.tZ  += aP * (tEff  - this.tZ);
      this.fbZ += aP * (fbEff - this.fbZ);
      this.mixZ+= aP * (baseMix - this.mixZ);

      const delaySamples = this.tZ * this.sr;

      // read current delayed samples BEFORE we write this sample
      const yL_read = this._read(this.bufL, this.w, delaySamples);
      const yR_read = this._read(this.bufR, this.w, delaySamples);

      let yL = 0, yR = 0;
      let wL = 0, wR = 0;

      switch (mode) {
        case 0: { // MONO
          const xM = 0.5 * (xL + xR);
          const yM = this._read(this.bufL, this.w, delaySamples); // use L buffer as mono
          // feedback LPF on mono stream
          this.lpfL += this.toneAlpha * (yM - this.lpfL);
          const fbSig = this.lpfL * this.fbZ;
          wL = xM + fbSig; // write mono into L buffer only
          this.bufL[this.w] = wL;
          // copy last R slot forward so ping-pong->mono switch is benign
          this.bufR[this.w] = this.bufR[(this.w + this.cap - 1) % this.cap];
          yL = yM;
          yR = yM;
          break;
        }
        case 1: { // STEREO (independent)
          // LPF in each feedback path
          this.lpfL += this.toneAlpha * (yL_read - this.lpfL);
          this.lpfR += this.toneAlpha * (yR_read - this.lpfR);
          wL = xL + this.lpfL * this.fbZ;
          wR = xR + this.lpfR * this.fbZ;
          this.bufL[this.w] = wL;
          this.bufR[this.w] = wR;
          yL = yL_read;
          yR = yR_read;
          break;
        }
        default: { // 2: PING_PONG (cross feedback)
          // cross-feed through LPF
          this.lpfL += this.toneAlpha * (yR_read - this.lpfL); // R → L
          this.lpfR += this.toneAlpha * (yL_read - this.lpfR); // L → R
          wL = xL + this.lpfL * this.fbZ;
          wR = xR + this.lpfR * this.fbZ;
          this.bufL[this.w] = wL;
          this.bufR[this.w] = wR;
          yL = yL_read;
          yR = yR_read;
          break;
        }
      }

      // Equal-power mix
      const dry = Math.cos(this.mixZ * Math.PI * 0.5);
      const wet = Math.sin(this.mixZ * Math.PI * 0.5);

      // If dryMono is enabled, use the mono sum for dry on both channels
      if (dryMono) {
        const xM = 0.5 * (xL + xR);
        outL[i] = dry * xM + wet * yL;
        outR[i] = dry * xM + wet * yR;
      } else {
        outL[i] = dry * xL + wet * yL;
        outR[i] = dry * xR + wet * yR;
      }

      // advance write index
      this.w++; if (this.w >= this.cap) this.w = 0;

      // clock rising-edge detection for next block's period
      // Consider threshold ~0.1 for generic pulses
      if (inClock) {
        const prev = this.clockLastVal;
        const curr = cIn;
        const th = 0.1;
        if (prev < th && curr >= th) {
          const edgeIdx = this.globalSampleIndex + i;
          if (this.lastEdgeSampleIndex >= 0) {
            const period = edgeIdx - this.lastEdgeSampleIndex;
            if (period > 1) {
              this.clockPeriodSamples = period;
            }
          }
          this.lastEdgeSampleIndex = edgeIdx;
        }
        this.clockLastVal = curr;
      }
    }

    // advance global sample counter
    this.globalSampleIndex += N;

    return true;
  }
}

registerProcessor("delay-processor", DelayProcessor);
