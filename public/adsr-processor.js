// /worklets/adsr-processor.js
// Gate in (0..5V). ENV out (0..10V). Sample-accurate ADSR with Schmitt-trigger gate.

class ADSRProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'attack',  defaultValue: 0.1, minValue: 0.001, maxValue: 20,  automationRate: 'k-rate' },
      { name: 'decay',   defaultValue: 0.2, minValue: 0.001, maxValue: 20,  automationRate: 'k-rate' },
      { name: 'sustain', defaultValue: 0.7, minValue: 0,     maxValue: 1,   automationRate: 'k-rate' },
      { name: 'release', defaultValue: 0.3, minValue: 0.001, maxValue: 60,  automationRate: 'k-rate' },
      { name: 'retrig',  defaultValue: 1,   minValue: 0,     maxValue: 1,   automationRate: 'k-rate' },
      { name: 'long',    defaultValue: 0,   minValue: 0,     maxValue: 1,   automationRate: 'k-rate' },
      { name: 'shapeLinear', defaultValue: 0, minValue: 0,   maxValue: 1,   automationRate: 'k-rate' }, // 0=exp, 1=linear
      { name: 'hiThresh',defaultValue: 2.5, minValue: 0.1,   maxValue: 4.9, automationRate: 'k-rate' },
      { name: 'loThresh',defaultValue: 1.5, minValue: 0,     maxValue: 4.8, automationRate: 'k-rate' },
      { name: 'maxv',    defaultValue: 10,  minValue: 0,     maxValue: 10,  automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.env = 0.0;
    this.state = 0; // 0 idle, 1 attack, 2 decay, 3 sustain, 4 release
    this.gate = 0;  // 0/1 after Schmitt
    this.lastGate = 0;
    this.deadUntil = -1; // edge deglitch (samples)

    // precompute to avoid denormals
    this.FLOOR = 0.001;    // minimum env value for exp-like segments
    this.MAXV  = 10.0;     // 10V envelope ceiling

    // Linear segment tracking
    this.segTarget = 0.0;
    this.segSlope = 0.0; // volts per sample
    this.segSamplesLeft = 0;
  }

  // per-sample one-pole approach-to-target with time constant tau (seconds)
  stepToward(current, target, tau) {
    if (tau <= 0) return target;
    const a = Math.exp(-1 / (tau * sampleRate));
    return target + (current - target) * a;
  }

  process(inputs, outputs, parameters) {
    const gateIn = (inputs[0] && inputs[0][0]) ? inputs[0][0] : null;
    const out0 = outputs[0] && outputs[0][0] ? outputs[0][0] : null; // ENV
    const out1 = outputs[1] && outputs[1][0] ? outputs[1][0] : null; // INV
    const n = (out0 || out1) ? (out0 ? out0.length : out1.length) : 128;

    const atk = parameters.attack[0];
    const dec = parameters.decay[0];
    const sus = parameters.sustain[0];
    const rel = parameters.release[0];
    const retrig = (parameters.retrig[0] || 0) > 0.5;
    const longMul = (parameters.long[0] || 0) > 0.5 ? 10 : 1;
    const shapeLinear = (parameters.shapeLinear[0] || 0) > 0.5;
    const hiT = parameters.hiThresh[0] || 2.5;
    const loT = parameters.loThresh[0] || 1.5;
    const MAXV = Math.max(0, Math.min(10, (parameters.maxv && parameters.maxv[0] !== undefined) ? parameters.maxv[0] : this.MAXV));

    const ATK = Math.max(0.0005, atk * longMul);
    const DEC = Math.max(0.0005, dec * longMul);
    const REL = Math.max(0.0005, rel * longMul);
    const SUS = Math.min(1, Math.max(0, sus)) * MAXV;

    const startLinearSeg = (target, seconds) => {
      const samples = Math.max(1, Math.floor(seconds * sampleRate));
      this.segTarget = target;
      this.segSamplesLeft = samples;
      this.segSlope = (target - this.env) / samples; // volts per sample
    };

    for (let i = 0; i < n; i++) {
      // --- Schmitt-trigger gate with 0.5 ms deglitch ---
      if (gateIn) {
        const v = gateIn[i]; // expects 0..5V on audio buffer
        if (this.deadUntil < currentFrame + i) {
          if (this.gate === 0 && v >= hiT) {
            this.gate = 1;
            this.deadUntil = currentFrame + i + Math.floor(sampleRate * 0.0005);
            // rising edge: attack or retrig
            if (retrig) this.env = 0.0; // hard retrig
            this.state = 1; // attack
            if (shapeLinear) startLinearSeg(MAXV, ATK)
          } else if (this.gate === 1 && v <= loT) {
            this.gate = 0;
            this.deadUntil = currentFrame + i + Math.floor(sampleRate * 0.0005);
            // falling edge: release
            this.state = 4; // release
            if (shapeLinear) startLinearSeg(0.0, REL)
          }
        }
      }

      // --- Envelope state machine (1V/oct safe; 0..10V out) ---
      switch (this.state) {
        case 0: // idle
          this.env = 0.0;
          break;

        case 1: // attack -> MAXV
          if (shapeLinear) {
            if (this.segSamplesLeft > 0) { this.env += this.segSlope; this.segSamplesLeft--; }
            if (this.segSamplesLeft <= 0 || this.env >= MAXV) {
              this.env = MAXV;
              this.state = 2;
              startLinearSeg(SUS, DEC);
            }
          } else {
            this.env = this.stepToward(this.env, MAXV, ATK);
            if (this.env >= MAXV * 0.999) {
              this.env = MAXV;
              this.state = 2; // decay
            }
          }
          break;

        case 2: // decay -> SUS
          if (shapeLinear) {
            if (this.segSamplesLeft > 0) { this.env += this.segSlope; this.segSamplesLeft--; }
            if (this.segSamplesLeft <= 0 || this.env <= SUS) {
              this.env = SUS;
              this.state = 3;
            }
          } else {
            this.env = this.stepToward(this.env, Math.max(this.FLOOR, SUS), DEC);
            if (Math.abs(this.env - SUS) <= 0.001 * MAXV) {
              this.env = SUS;
              this.state = 3; // sustain
            }
          }
          break;

        case 3: // sustain (hold at SUS while gate=1; if gate already 0, go release)
          if (this.gate === 0) this.state = 4;
          this.env = SUS;
          break;

        case 4: // release -> FLOOR (then idle)
          if (shapeLinear) {
            if (this.segSamplesLeft > 0) { this.env += this.segSlope; this.segSamplesLeft--; }
            if (this.segSamplesLeft <= 0 || this.env <= 0.0) {
              this.env = 0.0;
              this.state = 0;
            }
          } else {
            this.env = this.stepToward(this.env, this.FLOOR, REL);
            if (this.env <= this.FLOOR * 1.01) {
              this.env = 0.0;
              this.state = 0;
            }
          }
          break;
      }

      if (out0) out0[i] = this.env;
      if (out1) out1[i] = -this.env;
    }

    return true;
  }
}

registerProcessor('adsr-processor', ADSRProcessor);
