class LFOProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'freq',        defaultValue: 1.0,  minValue: 0.0001, maxValue: 50,  automationRate: 'k-rate' },
      { name: 'shape',       defaultValue: 0,    minValue: 0,      maxValue: 5,   automationRate: 'k-rate' },
      { name: 'pw',          defaultValue: 0.5,  minValue: 0.01,   maxValue: 0.99 },
      { name: 'amp',         defaultValue: 1.0,  minValue: 0.0,    maxValue: 2.0  }, // 1.0 => ±5 V
      { name: 'offset',      defaultValue: 0.0,  minValue: -1.0,   maxValue: 1.0  }, // −1..1 => −5..+5 V
      { name: 'rateCvAmt',   defaultValue: 1.0,  minValue: 0.0,    maxValue: 4.0  },
      { name: 'pwCvAmt',     defaultValue: 1.0,  minValue: 0.0,    maxValue: 1.0  },
      { name: 'ampCvAmt',    defaultValue: 1.0,  minValue: 0.0,    maxValue: 2.0  },
      { name: 'offCvAmt',    defaultValue: 1.0,  minValue: 0.0,    maxValue: 2.0  },
      { name: 'slew',        defaultValue: 0.0,  minValue: 0.0,    maxValue: 1.0  },
    ];
  }

  constructor() {
    super();
    this._phase = 0;
    this._lastSync = 0;
    this._rndVal  = Math.random()*2-1;
    this._nextVal = Math.random()*2-1;
    this._y = 0;
  }

  process(inputs, outputs, params) {
    const outBip = outputs[0] && outputs[0][0]; // −5..+5 V
    const outUni = outputs[1] && outputs[1][0]; // 0..10 V
    if (!outBip && !outUni) return true;

    const N  = (outBip || outUni).length;
    const sr = sampleRate;

    const inFreq = inputs[0] && inputs[0][0];
    const inPW   = inputs[1] && inputs[1][0];
    const inAmp  = inputs[2] && inputs[2][0];
    const inOff  = inputs[3] && inputs[3][0];
    const inSync = inputs[4] && inputs[4][0];

    const baseFreq = params.freq[0];
    const shape    = (params.shape[0] | 0);
    const basePW   = params.pw[0];
    const baseAmp  = params.amp[0];
    const baseOff  = params.offset[0];
    const rateAmt  = params.rateCvAmt[0];
    const pwAmt    = params.pwCvAmt[0];
    const ampAmt   = (params.ampCvAmt ? params.ampCvAmt[0] : 1.0);
    const offAmt   = (params.offCvAmt ? params.offCvAmt[0] : 1.0);
    const slew     = params.slew[0];

    const twoPI = Math.PI * 2;
    const alpha = slew <= 0 ? 1 : (1 - Math.exp(-1 / (sr * (0.002 + 0.25 * slew))));

    let p = this._phase;
    let y = this._y;

    for (let i = 0; i < N; i++) {
      // Sync
      if (inSync && inSync[i] > 0.5 && this._lastSync <= 0.5) {
        p = 0; this._rndVal = this._nextVal; this._nextVal = Math.random()*2-1;
      }
      this._lastSync = inSync ? inSync[i] : 0;

      // Rate
      const freqCV = inFreq ? inFreq[i] * rateAmt : 0;
      let mult = 1 + freqCV; if (mult < 0.0001) mult = 0.0001;
      const hz = Math.max(0.0001, baseFreq * mult);

      // PWM
      let pw = basePW + (inPW ? inPW[i] * pwAmt : 0);
      if (pw < 0.01) pw = 0.01; else if (pw > 0.99) pw = 0.99;

      // Advance
      const t = p;
      p += hz / sr; if (p >= 1) { p -= 1; this._rndVal = this._nextVal; this._nextVal = Math.random()*2-1; }

      // Core −1..+1
      let x;
      switch (shape) {
        case 0: x = Math.sin(twoPI * t); break;
        case 1: x = 4*Math.abs(t-0.5)-1; break;
        case 2: x = 2*t-1; break;
        case 3: x = (t < pw) ? 1 : -1; break;
        case 4: x = this._rndVal + (this._nextVal - this._rndVal) * t; break;
        default: x = this._rndVal; // stepped
      }

      // Slew
      y = (slew <= 0) ? x : (y + (x - y) * alpha);

      // Normalized signal with CV on amp/offset
      const ampCv = inAmp ? (1 + inAmp[i] * (0.5 * ampAmt)) : 1;
      const amp   = Math.max(0, baseAmp * ampCv);
      const offN  = baseOff + (inOff ? inOff[i] * (0.5 * offAmt) : 0);

      const sigN = (y * amp + offN);         // normalized (≈ −1..+1 before clamps)

      // Convert to volts
      let bipV = sigN * 5;                    // target −5..+5 V
      if (bipV >  10) bipV =  10;
      if (bipV < -10) bipV = -10;

      let uniV = (sigN + 1) * 5;              // 0..10 V (independent of bipV clamp)
      if (uniV < 0)  uniV = 0;
      if (uniV > 10) uniV = 10;

      if (outBip) outBip[i] = bipV;
      if (outUni) outUni[i] = uniV;
    }

    this._phase = p;
    this._y = y;
    return true;
  }
}
registerProcessor('lfo-processor', LFOProcessor);
