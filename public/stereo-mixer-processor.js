// stereo-mixer-processor.js
// 6-channel stereo mixer with per-channel VCA, 2 stereo sends/returns, master mix VCA
// Inputs (23):
//   0..11  -> ch0L, ch0R, ch1L, ch1R, ..., ch5L, ch5R
//   12..17 -> ch0CV..ch5CV (volts, 0..10 => 0..1)
//   18     -> mixCV (volts)
//   19..20 -> returnA L/R
//   21..22 -> returnB L/R
// Outputs (6 mono):
//   0: sendA L, 1: sendA R, 2: sendB L, 3: sendB R, 4: mix L, 5: mix R

class StereoMixerProcessor extends AudioWorkletProcessor {
  static get sabBytes() {
    // 6 channels + L + R = 8 floats
    return 8 * 4
  }
  static get parameterDescriptors() {
    const params = []
    // Per-channel controls (i = 0..5)
    for (let i = 0; i < 6; i++) {
      params.push({
        name: `ch${i}Offset`,
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      params.push({
        name: `ch${i}Amount`,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      params.push({
        name: `ch${i}Level`,
        defaultValue: 0.75,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      params.push({
        name: `ch${i}Pan`,
        defaultValue: 0,
        minValue: -1,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      params.push({
        name: `ch${i}SendA`,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      params.push({
        name: `ch${i}SendB`,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      params.push({
        name: `ch${i}SendAPre`,
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      }) // 1=pre, 0=post
      params.push({
        name: `ch${i}SendBPre`,
        defaultValue: 1,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      }) // 1=pre, 0=post
      params.push({
        name: `ch${i}Mute`,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
    }
    // Returns
    params.push({
      name: 'retALevel',
      defaultValue: 0.75,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'retBLevel',
      defaultValue: 0.75,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    // Master
    params.push({
      name: 'mixLLevel',
      defaultValue: 0.75,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'mixRLevel',
      defaultValue: 0.75,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'mixOffset',
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    }) // fully open without CV
    params.push({
      name: 'mixAmount',
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    }) // CV attenuator
    // Behavior
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
    params.push({
      name: 'muteAffectsSends',
      defaultValue: 1,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    })
    params.push({
      name: 'mixSat',
      defaultValue: 0,
      minValue: 0,
      maxValue: 1,
      automationRate: 'k-rate',
    }) // soft-clip blend
    return params
  }

  constructor() {
    super()
    // Smoothed per-channel VCA gains
    this._gCh = new Float32Array(6)
    // Gating states
    this._gatedCh = Array.from({ length: 6 }, () => true)
    this._gMix = 0
    this._gatedMix = true
    // DC-block states for 6 mono outputs
    this._prevX = new Float32Array(6)
    this._prevY = new Float32Array(6)
    // Meter accumulators (post-fader/pan per channel and master)
    this._accCh = new Float32Array(6)
    this._accMixL = 0
    this._accMixR = 0
    this._meterN = 0
    this._meterSamples = 0
    this._meterInterval = 1280 // ~25-35 fps depending on block size

    // SAB for meters (optional). UI provides via port.postMessage({ type:'initMeters', sab })
    this._meterArray = null

    this.port.onmessage = (e) => {
      const data = e.data
      if (data && data.type === 'initMeters' && data.sab) {
        try {
          this._meterArray = new Float32Array(data.sab)
        } catch {}
      }
    }
  }

  _expoCurve(x) {
    const k = 5
    const e = Math.exp(k)
    return (Math.exp(k * x) - 1) / (e - 1)
  }

  _map12dB(v) {
    // 0..1 -> 0..4x with ~unity at 0.75
    return v <= 0.75 ? v / 0.75 : 1 + (v - 0.75) * 12
  }

  process(inputs, outputs, p) {
    const outA_L = outputs[0]?.[0]
    if (!outA_L) return true
    const outA_R = outputs[1][0]
    const outB_L = outputs[2][0]
    const outB_R = outputs[3][0]
    const outM_L = outputs[4][0]
    const outM_R = outputs[5][0]
    const n = outM_L.length

    const expo = (p.expo[0] || 0) > 0.5
    const slewMs = p.slewMs[0]
    const dcBlock = (p.dcBlock[0] || 0) > 0.5
    const dcCutHz = p.dcCutHz[0]
    const hardGateDb = p.hardGateDb[0]
    const muteAffectsSends = (p.muteAffectsSends[0] || 0) > 0.5
    const mixSat = p.mixSat[0] || 0

    const slewA =
      slewMs <= 0 ? 0 : Math.exp(-1 / (sampleRate * (slewMs / 1000)))
    const r = dcBlock ? Math.exp((-2 * Math.PI * dcCutHz) / sampleRate) : 0
    const thLin = 10 ** ((hardGateDb || -90) / 20)
    const thHi = thLin * 2
    const thLo = thLin

    let sendA_L = 0,
      sendA_R = 0,
      sendB_L = 0,
      sendB_R = 0
    let mixL = 0,
      mixR = 0

    for (let i = 0; i < n; i++) {
      sendA_L = 0
      sendA_R = 0
      sendB_L = 0
      sendB_R = 0
      mixL = 0
      mixR = 0

      for (let ch = 0; ch < 6; ch++) {
        const idxL = ch * 2
        const xL = inputs[idxL]?.[0] ? inputs[idxL][0][i] : 0
        const xR = inputs[idxL + 1]?.[0] ? inputs[idxL + 1][0][i] : 0
        const cvConnected = !!inputs[12 + ch]?.[0]
        const cvV = cvConnected ? inputs[12 + ch][0][i] : 0
        const cvPos = cvV > 0 ? cvV : 0

        const offset = p[`ch${ch}Offset`][0]
        const amount = p[`ch${ch}Amount`][0]
        const level = p[`ch${ch}Level`][0]
        const pan = p[`ch${ch}Pan`][0]
        const sA = p[`ch${ch}SendA`][0]
        const sB = p[`ch${ch}SendB`][0]
        const sAPre = (p[`ch${ch}SendAPre`][0] || 0) > 0.5
        const sBPre = (p[`ch${ch}SendBPre`][0] || 0) > 0.5
        const muted = (p[`ch${ch}Mute`][0] || 0) > 0.5

        // Compute VCA target
        let gTarget = cvConnected ? amount * (cvPos / 10) : offset
        // clamp
        gTarget = gTarget < 0 ? 0 : gTarget > 1 ? 1 : gTarget
        if (expo) gTarget = this._expoCurve(gTarget)

        // hard gate with hysteresis
        if (this._gatedCh[ch]) {
          if (gTarget >= thHi) this._gatedCh[ch] = false
        } else {
          if (gTarget <= thLo) this._gatedCh[ch] = true
        }
        if (this._gatedCh[ch]) gTarget = 0

        // smooth
        const gSm =
          slewA === 0 ? gTarget : gTarget + (this._gCh[ch] - gTarget) * slewA
        this._gCh[ch] = gSm

        // Pre-pan, post-VCA stereo; if only one side is connected, treat as mono
        const preL = xL * gSm
        const preR0 = xR * gSm
        const hasLChan = !!inputs[idxL]?.[0]
        const hasRChan = !!inputs[idxL + 1]?.[0]
        let stL = preL
        let stR = preR0
        if (hasLChan && !hasRChan) {
          stR = stL
        } else if (hasRChan && !hasLChan) {
          stL = stR
        }

        // Equal-power pan
        const panClamped = pan < -1 ? -1 : pan > 1 ? 1 : pan
        const gL = Math.sqrt(0.5 * (1 - panClamped))
        const gR = Math.sqrt(0.5 * (1 + panClamped))

        // Channel fader (+12 dB mapping)
        const fader = this._map12dB(level)

        // If source is effectively mono (only one side was connected),
        // compensate pan law so center doesn't sound quieter.
        const isMonoSource = (hasLChan && !hasRChan) || (hasRChan && !hasLChan)
        const panComp = isMonoSource ? 1 / Math.max(gL, gR) : 1

        const postL = stL * gL * fader * panComp
        const postR = stR * gR * fader * panComp

        // Sends
        const preMuteScalar = 1
        const muteScalarForSends = muted && muteAffectsSends ? 0 : 1
        // A
        if (sAPre) {
          sendA_L += stL * sA * preMuteScalar * muteScalarForSends
          sendA_R += stR * sA * preMuteScalar * muteScalarForSends
        } else {
          sendA_L += postL * sA * muteScalarForSends
          sendA_R += postR * sA * muteScalarForSends
        }
        // B
        if (sBPre) {
          sendB_L += stL * sB * preMuteScalar * muteScalarForSends
          sendB_R += stR * sB * preMuteScalar * muteScalarForSends
        } else {
          sendB_L += postL * sB * muteScalarForSends
          sendB_R += postR * sB * muteScalarForSends
        }

        // Mix path (mute affects only main mix always)
        if (!muted) {
          mixL += postL
          mixR += postR
        }

        // Accumulate per-channel meter (post-fader/pan, pre-mix VCA)
        const y2 = postL * postL + postR * postR
        this._accCh[ch] += y2
      }

      // Returns with +12dB mapping
      const retAL = inputs[19]?.[0] ? inputs[19][0][i] : 0
      const retAR = inputs[20]?.[0] ? inputs[20][0][i] : 0
      const retBL = inputs[21]?.[0] ? inputs[21][0][i] : 0
      const retBR = inputs[22]?.[0] ? inputs[22][0][i] : 0
      const retAScalar = this._map12dB(p.retALevel[0])
      const retBScalar = this._map12dB(p.retBLevel[0])
      mixL += retAL * retAScalar + retBL * retBScalar
      mixR += retAR * retAScalar + retBR * retBScalar

      // Mix VCA (shared for L/R)
      const mixCvConnected = !!inputs[18]?.[0]
      const mixCV = mixCvConnected ? inputs[18][0][i] : 10
      const mixCvPos = mixCV > 0 ? mixCV : 0
      const mixOffset = p.mixOffset[0]
      const mixAmount = p.mixAmount[0]
      let gMixTarget = mixCvConnected ? mixAmount * (mixCvPos / 10) : mixOffset
      gMixTarget = gMixTarget < 0 ? 0 : gMixTarget > 1 ? 1 : gMixTarget
      if (expo) gMixTarget = this._expoCurve(gMixTarget)

      if (this._gatedMix) {
        if (gMixTarget >= thHi) this._gatedMix = false
      } else {
        if (gMixTarget <= thLo) this._gatedMix = true
      }
      if (this._gatedMix) gMixTarget = 0

      const gMixSm =
        slewA === 0
          ? gMixTarget
          : gMixTarget + (this._gMix - gMixTarget) * slewA
      this._gMix = gMixSm

      let yL = mixL * gMixSm * this._map12dB(p.mixLLevel[0])
      let yR = mixR * gMixSm * this._map12dB(p.mixRLevel[0])

      // Optional soft clip on mix bus
      if (mixSat > 0) {
        const k = 2.5
        const sL = Math.tanh(k * yL) / Math.tanh(k)
        const sR = Math.tanh(k * yR) / Math.tanh(k)
        yL = yL * (1 - mixSat) + sL * mixSat
        yR = yR * (1 - mixSat) + sR * mixSat
      }

      // DC block on all 6 outputs
      let aL = sendA_L,
        aR = sendA_R,
        bL = sendB_L,
        bR = sendB_R
      let mL = yL,
        mR = yR
      if (dcBlock) {
        // sendA L (0)
        let hp = aL - this._prevX[0] + r * this._prevY[0]
        this._prevX[0] = aL
        this._prevY[0] = hp
        aL = hp
        // sendA R (1)
        hp = aR - this._prevX[1] + r * this._prevY[1]
        this._prevX[1] = aR
        this._prevY[1] = hp
        aR = hp
        // sendB L (2)
        hp = bL - this._prevX[2] + r * this._prevY[2]
        this._prevX[2] = bL
        this._prevY[2] = hp
        bL = hp
        // sendB R (3)
        hp = bR - this._prevX[3] + r * this._prevY[3]
        this._prevX[3] = bR
        this._prevY[3] = hp
        bR = hp
        // mix L (4)
        hp = mL - this._prevX[4] + r * this._prevY[4]
        this._prevX[4] = mL
        this._prevY[4] = hp
        mL = hp
        // mix R (5)
        hp = mR - this._prevX[5] + r * this._prevY[5]
        this._prevX[5] = mR
        this._prevY[5] = hp
        mR = hp
      }

      outA_L[i] = aL
      outA_R[i] = aR
      outB_L[i] = bL
      outB_R[i] = bR
      outM_L[i] = mL
      outM_R[i] = mR

      // Accumulate master meter (post mix)
      this._accMixL += mL * mL
      this._accMixR += mR * mR
      this._meterN += 1
      this._meterSamples += 1

      if (this._meterSamples >= this._meterInterval) {
        const nFrames = this._meterN
        if (nFrames > 0) {
          const meterArray = this._meterArray
          if (meterArray && meterArray.length >= 8) {
            // Reference: 0 dB at unity with ±5 V input, centered pan.
            // With equal-power pan and our averaging across L/R, that yields ~2.5 RMS.
            const refRms = 2.5
            const norm = (v) => {
              const r = v / refRms // 1.0 at 0 dB
              // Map +12 dB (×4) to 1.0 on the bar. Clamp 0..1
              const n = r / 4
              return n < 0 ? 0 : n > 1 ? 1 : n
            }
            for (let c = 0; c < 6; c++) {
              const raw = Math.sqrt(this._accCh[c] / (nFrames * 2))
              meterArray[c] = norm(raw)
              this._accCh[c] = 0
            }
            const rawL = Math.sqrt(this._accMixL / nFrames)
            const rawR = Math.sqrt(this._accMixR / nFrames)
            meterArray[6] = norm(rawL)
            meterArray[7] = norm(rawR)
          }
          this._accMixL = 0
          this._accMixR = 0
          this._meterN = 0
        }
        this._meterSamples = 0
      }
    }

    return true
  }
}

registerProcessor('stereo-mixer-processor', StereoMixerProcessor)

//
// AudioWorklet Processor Rules
// - Files must live in public and be named {name}-processor.js
// - Register with registerProcessor('{name}-processor', class extends AudioWorkletProcessor { ... })
// - Avoid allocations and I/O in process(); define parameters via static get parameterDescriptors()
//
