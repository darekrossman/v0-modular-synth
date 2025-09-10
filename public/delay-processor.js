// /public/delay-processor.js
// Matrix-topology stereo delay with k-rate params and audio-rate CV for Time & Feedback.
// Inputs:
//   in[0]: 2ch audio (L,R)
//   in[1]: 1ch time CV  (-1..+1)
//   in[2]: 1ch feedback CV (-1..+1)
//   in[3]: 1ch clock input (pulses). Rising edges define clock period.
// Output:
//   out[0]: 2ch audio (L,R)

const TIME_MIN = 0.01
const TIME_MAX = 2.0
const FB_MAX = 0.95
const MAX_BUFFERS = 8 // Maximum number of concurrent delay buffers

class DelayProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: 'time',
        defaultValue: 0.25,
        minValue: TIME_MIN,
        maxValue: TIME_MAX,
        automationRate: 'k-rate',
      }, // seconds
      {
        name: 'feedback',
        defaultValue: 0.3,
        minValue: 0.0,
        maxValue: FB_MAX,
        automationRate: 'k-rate',
      },
      {
        name: 'mix',
        defaultValue: 0.5,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'toneHz',
        defaultValue: 8000,
        minValue: 200,
        maxValue: 16000,
        automationRate: 'k-rate',
      }, // LPF in feedback
      // 0 = MONO, 1 = STEREO, 2 = PING_PONG (kept for UI mapping; not used directly in DSP)
      {
        name: 'mode',
        defaultValue: 0,
        minValue: 0,
        maxValue: 2,
        automationRate: 'k-rate',
      },
      // Matrix controls
      {
        name: 'crossfeed', // 0..1: portion of feedback that crosses L<->R
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'crossInput', // 0..1: portion of input written to the opposite channel's line
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'width', // 0..1: width applied to wet signal (0 mono → 1 full)
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'timeSpread', // -0.5..+0.5: spread around base time (sym or R-only depending on link)
        defaultValue: 0.0,
        minValue: -0.5,
        maxValue: 0.5,
        automationRate: 'k-rate',
      },
      {
        name: 'link', // >=0.5 → symmetric spread around base time; <0.5 → spread applies to R only
        defaultValue: 1.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // CV depths (0..1). CV signals are expected in [-1..+1].
      {
        name: 'timeCvAmt',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'fbCvAmt',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // Clocked mode: if enabled, delay time follows measured clock period * clockDiv
      {
        name: 'clocked',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      {
        name: 'clockDiv',
        defaultValue: 0,
        minValue: 0,
        maxValue: 15,
        automationRate: 'k-rate',
      }, // Division index for synced times
      // Dry mono balance: when enabled, dry path uses mono sum for both channels
      {
        name: 'dryMono',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // Wet mono input handling: when enabled, wet input uses mono sum
      {
        name: 'wetMono',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
      // Stable mode: when enabled, time changes don't affect playing delays
      {
        name: 'stable',
        defaultValue: 0.0,
        minValue: 0.0,
        maxValue: 1.0,
        automationRate: 'k-rate',
      },
    ]
  }

  constructor() {
    super()

    this.sr = sampleRate

    // Max buffer: TIME_MAX + a little guard
    this.cap = Math.max(2048, Math.ceil((TIME_MAX + 0.05) * this.sr) + 4)

    // Multi-buffer system for stable mode
    this.buffers = []
    for (let i = 0; i < MAX_BUFFERS; i++) {
      this.buffers.push({
        bufL: new Float32Array(this.cap),
        bufR: new Float32Array(this.cap),
        w: 0,
        delaySamplesL: 0.25 * this.sr,
        delaySamplesR: 0.25 * this.sr,
        active: false,
        fadeOut: 0,
        fadeIn: 0, // Fade-in envelope for smooth activation
        lpfL: 0,
        lpfR: 0,
        energy: 0, // Track buffer energy for auto-deactivation
        silentSamples: 0, // Count samples below threshold
        isWriteBuffer: false, // Track if this buffer is receiving new input
        // DC blocker state (high-pass filter to remove DC offset)
        dcBlockerL: { x1: 0, y1: 0 },
        dcBlockerR: { x1: 0, y1: 0 },
      })
    }

    // Primary buffer (always index 0, used in classic mode)
    this.primaryBuffer = this.buffers[0]
    this.primaryBuffer.active = true
    this.primaryBuffer.isWriteBuffer = true // CRITICAL: Must be set on init!
    this.primaryBuffer.fadeIn = 1.0 // Start fully faded in

    // Smoothed params (for zipper-free behavior even if host jumps)
    this.tZL = 0.25 // seconds (left)
    this.tZR = 0.25 // seconds (right)
    this.fbZ = 0.3 // 0..FB_MAX
    this.mixZ = 0.5 // 0..1
    this.aParam = 1 - Math.exp(-1 / (this.sr * 0.02)) // ~20ms

    // Stable mode state
    this.stableMode = false
    this.currentWriteBuffer = 0 // Index of buffer currently receiving input
    this.lastDelayTimeL = 0.25
    this.lastDelayTimeR = 0.25
    this.lastTimeChangeGlobal = 0 // Global sample index of last time change
    this.debounceThreshold = this.sr * 0.05 // 50ms debounce for creating new buffers

    // Input gating and windowing for smooth transitions
    this.inputGate = 1.0 // Gate level for input during transitions
    this.inputGateTarget = 1.0
    this.inputGateSpeed = 1.0 / (this.sr * 0.005) // 5ms gate transitions
    this.bufferTransition = false // Flag for buffer transition in progress
    this.transitionBuffer = -1 // Buffer being transitioned to
    this.transitionProgress = 0 // Progress of windowed transition (0-1)
    this.transitionSpeed = 1.0 / (this.sr * 0.025) // 25ms window for buffer switching

    this.toneAlpha = 1 - Math.exp((-2 * Math.PI * 8000) / this.sr) // set each block

    // Clock detection state (48 PPQ)
    this.clockLastVal = 0.0
    this.lastEdgeSampleIndex = -1 // global sample index of last rising edge
    this.clockPeriodSamples = 0 // measured period in samples (one pulse)
    this.quarterNoteSamples = 0 // calculated quarter note in samples
    this.globalSampleIndex = 0 // running sample counter across blocks

    // Note divisions for synced delays (index to multiplier of quarter note)
    // 1/64, 1/32T, 1/32, 1/16T, 1/16, 1/8T, 1/8, 1/4T, 1/4, 1/2T, 1/2, 1/1T, 1/1, 2/1, 4/1, 8/1
    this.noteDivisions = [
      1 / 16, // 1/64 note
      1 / 12, // 1/32 triplet
      1 / 8, // 1/32 note
      1 / 6, // 1/16 triplet
      1 / 4, // 1/16 note
      1 / 3, // 1/8 triplet
      1 / 2, // 1/8 note
      2 / 3, // 1/4 triplet
      1, // 1/4 note (quarter)
      4 / 3, // 1/2 triplet
      2, // 1/2 note (half)
      8 / 3, // whole triplet
      4, // whole note
      8, // 2 bars
      16, // 4 bars
      32, // 8 bars
    ]
  }

  // ring read with linear interpolation (pos can be fractional, relative to absolute write index)
  _read(buf, w, delaySamples) {
    let pos = w - delaySamples
    while (pos < 0) pos += this.cap // wrap backward
    // pos in [0..cap)
    const i0 = pos | 0
    const frac = pos - i0
    const i1 = (i0 + 1) % this.cap
    const s0 = buf[i0]
    const s1 = buf[i1]
    return s0 + (s1 - s0) * frac
  }

  // Find or create a buffer for the new per-channel delay times
  _getOrCreateBuffer(delaySamplesL, delaySamplesR) {
    // First check if we already have a buffer with these delay times
    for (let i = 0; i < MAX_BUFFERS; i++) {
      if (
        this.buffers[i].active &&
        this.buffers[i].isWriteBuffer &&
        Math.abs(this.buffers[i].delaySamplesL - delaySamplesL) < 1 &&
        Math.abs(this.buffers[i].delaySamplesR - delaySamplesR) < 1
      ) {
        return i
      }
    }

    // Find an inactive buffer to use
    for (let i = 1; i < MAX_BUFFERS; i++) {
      // Start from 1, keeping 0 as primary
      if (!this.buffers[i].active) {
        const buf = this.buffers[i]
        buf.active = true
        buf.delaySamplesL = delaySamplesL
        buf.delaySamplesR = delaySamplesR
        buf.fadeOut = 0
        buf.fadeIn = 0 // Start fade-in from 0
        // Clear the buffer to prevent old audio from playing
        buf.bufL.fill(0)
        buf.bufR.fill(0)
        buf.w = 0
        buf.lpfL = 0
        buf.lpfR = 0
        buf.energy = 0
        buf.silentSamples = 0
        buf.isWriteBuffer = true
        // Reset DC blocker state
        buf.dcBlockerL = { x1: 0, y1: 0 }
        buf.dcBlockerR = { x1: 0, y1: 0 }
        return i
      }
    }

    // All buffers are active - find the one with lowest energy that's not the write buffer
    let lowestEnergyIdx = -1
    let lowestEnergy = Infinity
    for (let i = 1; i < MAX_BUFFERS; i++) {
      if (
        !this.buffers[i].isWriteBuffer &&
        this.buffers[i].energy < lowestEnergy
      ) {
        lowestEnergy = this.buffers[i].energy
        lowestEnergyIdx = i
      }
    }

    if (lowestEnergyIdx >= 0) {
      // Start fading out the lowest energy buffer
      this.buffers[lowestEnergyIdx].fadeOut = 0.01 // Start fade immediately
    }
    return -1 // Signal that we're at capacity
  }

  process(inputs, outputs, params) {
    const out = outputs[0]
    if (!out || out.length < 2) return true

    const outL = out[0]
    const outR = out[1]
    const N = outL.length

    // Inputs:
    const inA = inputs[0] || [] // stereo audio
    const inL = inA[0] || null
    const inR = inA[1] || null

    const inTimeCv = inputs[1]?.[0] ? inputs[1][0] : null
    const inFbCv = inputs[2]?.[0] ? inputs[2][0] : null
    const inClock = inputs[3]?.[0] ? inputs[3][0] : null

    // k-rate params for this block
    const baseTime = params.time[0]
    const baseFb = params.feedback[0]
    const baseMix = params.mix[0]
    const toneHz = params.toneHz[0]
    const timeCvAmt = params.timeCvAmt[0] // 0..1
    const fbCvAmt = params.fbCvAmt[0] // 0..1
    const clocked = params.clocked[0] >= 0.5
    const clockDivIdx = Math.round(params.clockDiv[0])
    const dryMono = params.dryMono[0] >= 0.5
    const wetMono = params.wetMono ? params.wetMono[0] >= 0.5 : false
    const stable = params.stable[0] >= 0.5
    const crossfeed = params.crossfeed ? params.crossfeed[0] : 0.0
    const crossInput = params.crossInput ? params.crossInput[0] : 0.0
    const width = params.width ? params.width[0] : 1.0
    const timeSpread = params.timeSpread ? params.timeSpread[0] : 0.0
    const link = params.link ? params.link[0] >= 0.5 : true

    // Update tone LPF coefficient once per block
    this.toneAlpha =
      1 - Math.exp((-2 * Math.PI * Math.max(10, toneHz)) / this.sr)

    // smooth static params toward base
    const aP = this.aParam

    // precompute span used to scale CV → seconds/gain
    const timeSpan = (TIME_MAX - TIME_MIN) * 0.5
    const fbSpan = FB_MAX * 0.5

    // Determine clock-derived time from 48 PPQ
    let clockTimeSec = null
    if (clocked && this.quarterNoteSamples > 0) {
      // Get the note division multiplier
      const divIdx = Math.max(
        0,
        Math.min(this.noteDivisions.length - 1, clockDivIdx),
      )
      const noteMultiplier = this.noteDivisions[divIdx]
      // Calculate delay time based on quarter note and division
      clockTimeSec = (this.quarterNoteSamples / this.sr) * noteMultiplier
      // clamp to safe bounds
      if (clockTimeSec < TIME_MIN) clockTimeSec = TIME_MIN
      if (clockTimeSec > TIME_MAX) clockTimeSec = TIME_MAX
    }

    // We'll use equal-power mix (per-sample mixZ for accuracy when modulated)
    for (let i = 0; i < N; i++) {
      let xL = inL ? inL[i] : 0
      let xR = inR ? inR[i] : 0

      // audio-rate CV samples (expected -1..+1)
      const tCv = inTimeCv ? inTimeCv[i] : 0
      const fCv = inFbCv ? inFbCv[i] : 0
      const cIn = inClock ? inClock[i] : 0

      // Mono-wet input handling (if enabled)
      if (wetMono) {
        const xM = 0.5 * (xL + xR)
        xL = xM
        xR = xM
      }

      // effective targets with CV & hard clamp (base time)
      let tEff
      if (clockTimeSec != null) {
        // In sync mode, CV modulates the clock-derived time
        tEff = clockTimeSec + tCv * timeCvAmt * timeSpan
      } else {
        // In free mode, CV modulates the base time
        tEff = baseTime + tCv * timeCvAmt * timeSpan
      }
      if (tEff < TIME_MIN) tEff = TIME_MIN
      if (tEff > TIME_MAX) tEff = TIME_MAX

      // derive per-channel effective times using spread and link
      let tEffL, tEffR
      if (link) {
        // symmetric around base
        const s = timeSpread
        tEffL = tEff * (1 - s)
        tEffR = tEff * (1 + s)
      } else {
        // spread applies to R only
        tEffL = tEff
        tEffR = tEff * (1 + timeSpread)
      }
      if (tEffL < TIME_MIN) tEffL = TIME_MIN
      if (tEffL > TIME_MAX) tEffL = TIME_MAX
      if (tEffR < TIME_MIN) tEffR = TIME_MIN
      if (tEffR > TIME_MAX) tEffR = TIME_MAX

      let fbEff = baseFb + fCv * fbCvAmt * fbSpan
      if (fbEff < 0) fbEff = 0
      if (fbEff > FB_MAX) fbEff = FB_MAX

      // Handle delay time changes
      if (stable) {
        // Stable mode: check if we need to create a new buffer
        const timeDiff = Math.max(
          Math.abs(tEffL - this.lastDelayTimeL),
          Math.abs(tEffR - this.lastDelayTimeR),
        )
        const samplesSinceLastChange =
          this.globalSampleIndex + i - this.lastTimeChangeGlobal

        if (
          timeDiff > 0.001 &&
          samplesSinceLastChange > this.debounceThreshold &&
          !this.bufferTransition
        ) {
          // Significant time change after debounce period
          const newDelaySamplesL = tEffL * this.sr
          const newDelaySamplesR = tEffR * this.sr
          const newBufferIdx = this._getOrCreateBuffer(
            newDelaySamplesL,
            newDelaySamplesR,
          )

          if (newBufferIdx >= 0) {
            // Start windowed transition to new buffer
            this.bufferTransition = true
            this.transitionBuffer = newBufferIdx
            this.transitionProgress = 0
            this.inputGateTarget = 0 // Start gating input
            this.lastDelayTimeL = tEffL
            this.lastDelayTimeR = tEffR
            this.lastTimeChangeGlobal = this.globalSampleIndex + i
          }
        }
        // Keep smoothed times updated for display purposes
        this.tZL = tEffL
        this.tZR = tEffR
      } else {
        // Classic mode - use primary buffer with smoothing
        this.tZL += aP * (tEffL - this.tZL)
        this.tZR += aP * (tEffR - this.tZR)
        this.currentWriteBuffer = 0
        this.primaryBuffer.active = true // Ensure primary buffer is active
        this.primaryBuffer.delaySamplesL = this.tZL * this.sr
        this.primaryBuffer.delaySamplesR = this.tZR * this.sr
        this.primaryBuffer.isWriteBuffer = true
        this.primaryBuffer.fadeIn = 1.0 // No fade-in needed for primary buffer
        // Reset transition state in classic mode
        this.bufferTransition = false
        this.transitionBuffer = -1
        this.transitionProgress = 0
        this.inputGate = 1.0
        this.inputGateTarget = 1.0
        // Deactivate all other buffers in classic mode
        for (let j = 1; j < MAX_BUFFERS; j++) {
          this.buffers[j].active = false
          this.buffers[j].isWriteBuffer = false
        }
      }

      this.fbZ += aP * (fbEff - this.fbZ)
      this.mixZ += aP * (baseMix - this.mixZ)

      // Process ALL active buffers - they all need to apply feedback
      let yL_total = 0,
        yR_total = 0
      let activeCount = 0
      const silenceThreshold = 0.0001 // -80dB
      const fadeInSpeed = 1.0 / (this.sr * 0.01) // 10ms fade-in
      const fadeOutSpeed = 1.0 / (this.sr * 0.02) // 20ms fade-out
      const dcBlockerCoeff = 0.995 // DC blocker coefficient

      for (let bufIdx = 0; bufIdx < MAX_BUFFERS; bufIdx++) {
        const buf = this.buffers[bufIdx]
        if (!buf.active) continue

        // Read delayed signal from this buffer
        let yL_delayed = this._read(buf.bufL, buf.w, buf.delaySamplesL)
        let yR_delayed = this._read(buf.bufR, buf.w, buf.delaySamplesR)

        // Apply DC blocker (high-pass filter to remove DC offset)
        // y[n] = x[n] - x[n-1] + coeff * y[n-1]
        const dcL = buf.dcBlockerL
        const yL_dc = yL_delayed - dcL.x1 + dcBlockerCoeff * dcL.y1
        dcL.x1 = yL_delayed
        dcL.y1 = yL_dc
        yL_delayed = yL_dc

        const dcR = buf.dcBlockerR
        const yR_dc = yR_delayed - dcR.x1 + dcBlockerCoeff * dcR.y1
        dcR.x1 = yR_delayed
        dcR.y1 = yR_dc
        yR_delayed = yR_dc

        // Calculate input mix for windowed buffer switching FIRST
        let inputMix = 0

        // Simplified logic to avoid edge cases
        if (this.bufferTransition) {
          // During transition: fade between old and new buffers
          if (bufIdx === this.currentWriteBuffer) {
            // Old write buffer - fade out
            inputMix = 1.0 - this.transitionProgress
          } else if (bufIdx === this.transitionBuffer) {
            // New buffer - fade in
            inputMix = this.transitionProgress
          }
        } else {
          // Normal operation: only write buffer gets input
          if (buf.isWriteBuffer) {
            inputMix = 1.0
          }
        }

        // Apply feedback to ALL buffers
        // Write buffers get input + feedback, others get feedback only
        let feedL = 0,
          feedR = 0

        // Determine if this buffer should receive input
        const shouldReceiveInput = inputMix > 0

        // Update LPFs from delayed taps first (per channel)
        buf.lpfL += this.toneAlpha * (yL_delayed - buf.lpfL)
        buf.lpfR += this.toneAlpha * (yR_delayed - buf.lpfR)

        // Compute input cross-mix
        const xinL = (1.0 - crossInput) * xL + crossInput * xR
        const xinR = crossInput * xL + (1.0 - crossInput) * xR

        // Feedback matrix: [[a, b], [b, a]] where
        // a = fb * (1 - crossfeed), b = fb * crossfeed
        const aFb = this.fbZ * (1.0 - crossfeed)
        const bFb = this.fbZ * crossfeed
        const fbL = aFb * buf.lpfL + bFb * buf.lpfR
        const fbR = aFb * buf.lpfR + bFb * buf.lpfL

        if (shouldReceiveInput) {
          const ingate = this.inputGate * inputMix
          feedL = xinL * ingate + fbL
          feedR = xinR * ingate + fbR
        } else {
          feedL = fbL
          feedR = fbR
        }

        // Write the feedback back into the buffer
        buf.bufL[buf.w] = feedL
        buf.bufR[buf.w] = feedR

        // Check for silence and initiate fade-out if needed
        const currentEnergy = Math.abs(yL_delayed) + Math.abs(yR_delayed)
        if (
          currentEnergy < silenceThreshold &&
          !buf.isWriteBuffer &&
          buf.fadeOut === 0
        ) {
          buf.silentSamples++
          if (buf.silentSamples > this.sr * 0.05) {
            // 50ms of silence
            buf.fadeOut = 0.001 // Start fade-out
            buf.silentSamples = 0
          }
        } else if (buf.fadeOut === 0) {
          buf.silentSamples = 0
        }

        // Apply fade-in envelope for smooth activation
        let envelope = 1.0
        if (buf.fadeIn < 1.0) {
          buf.fadeIn += fadeInSpeed
          if (buf.fadeIn > 1.0) buf.fadeIn = 1.0
          // Cosine curve for smooth fade-in
          envelope = (1.0 - Math.cos(buf.fadeIn * Math.PI)) * 0.5
        }

        // Apply fade-out envelope if buffer is being deactivated
        if (buf.fadeOut > 0) {
          const fadeOutEnv = 1.0 - buf.fadeOut
          // Cosine curve for smooth fade-out
          envelope *= (1.0 + Math.cos(buf.fadeOut * Math.PI)) * 0.5
          buf.fadeOut += fadeOutSpeed
          if (buf.fadeOut >= 1.0) {
            buf.active = false
            buf.fadeOut = 0
            buf.fadeIn = 0
            // Clear buffer on deactivation
            buf.bufL.fill(0)
            buf.bufR.fill(0)
            buf.dcBlockerL = { x1: 0, y1: 0 }
            buf.dcBlockerR = { x1: 0, y1: 0 }
            continue
          }
        }

        // Add to output mix with envelope applied
        yL_total += yL_delayed * envelope
        yR_total += yR_delayed * envelope
        activeCount++
      }

      // Normalize mixed output to prevent clipping
      if (activeCount > 1) {
        const norm = 1.0 / Math.sqrt(activeCount)
        yL_total *= norm
        yR_total *= norm
      }

      // Use the mixed output from all buffers and apply wet width in M/S domain
      let yL = yL_total
      let yR = yR_total
      if (width < 1.0 || width > 0.0) {
        const mid = 0.5 * (yL + yR)
        let side = 0.5 * (yL - yR)
        side *= Math.max(0, Math.min(1, width))
        yL = mid + side
        yR = mid - side
      }

      // Equal-power mix
      const dry = Math.cos(this.mixZ * Math.PI * 0.5)
      const wet = Math.sin(this.mixZ * Math.PI * 0.5)

      // If dryMono is enabled, use the mono sum for dry on both channels
      if (dryMono) {
        const xM = 0.5 * (xL + xR)
        outL[i] = dry * xM + wet * yL
        outR[i] = dry * xM + wet * yR
      } else {
        outL[i] = dry * xL + wet * yL
        outR[i] = dry * xR + wet * yR
      }

      // Update input gate smoothly
      if (this.inputGate < this.inputGateTarget) {
        this.inputGate += this.inputGateSpeed
        if (this.inputGate > this.inputGateTarget)
          this.inputGate = this.inputGateTarget
      } else if (this.inputGate > this.inputGateTarget) {
        this.inputGate -= this.inputGateSpeed
        if (this.inputGate < this.inputGateTarget)
          this.inputGate = this.inputGateTarget
      }

      // Update windowed transition progress
      if (this.bufferTransition) {
        this.transitionProgress += this.transitionSpeed

        if (this.transitionProgress >= 0.5 && this.inputGateTarget === 0) {
          // Halfway through transition, start bringing input gate back up
          this.inputGateTarget = 1.0
        }

        if (this.transitionProgress >= 1.0) {
          // Transition complete
          this.transitionProgress = 1.0
          this.bufferTransition = false

          // Only complete transition if we have a valid target buffer
          if (
            this.transitionBuffer >= 0 &&
            this.transitionBuffer < MAX_BUFFERS
          ) {
            // Mark old buffer as no longer receiving input
            if (this.currentWriteBuffer >= 0) {
              this.buffers[this.currentWriteBuffer].isWriteBuffer = false
            }

            // Switch to new buffer
            this.currentWriteBuffer = this.transitionBuffer
            this.buffers[this.currentWriteBuffer].isWriteBuffer = true
          }
          this.transitionBuffer = -1
        }
      }

      // Advance write indices for all active buffers
      for (let bufIdx = 0; bufIdx < MAX_BUFFERS; bufIdx++) {
        const buf = this.buffers[bufIdx]
        if (buf.active) {
          buf.w++
          if (buf.w >= this.cap) buf.w = 0
        }
      }

      // clock rising-edge detection for 48 PPQ
      // Consider threshold ~0.1 for generic pulses
      if (inClock) {
        const prev = this.clockLastVal
        const curr = cIn
        const th = 0.1
        if (prev < th && curr >= th) {
          const edgeIdx = this.globalSampleIndex + i
          if (this.lastEdgeSampleIndex >= 0) {
            const period = edgeIdx - this.lastEdgeSampleIndex
            if (period > 1) {
              this.clockPeriodSamples = period
              // With 48 PPQ, one quarter note = 48 pulses
              this.quarterNoteSamples = period * 48
            }
          }
          this.lastEdgeSampleIndex = edgeIdx
        }
        this.clockLastVal = curr
      }
    }

    // advance global sample counter
    this.globalSampleIndex += N

    return true
  }
}

registerProcessor('delay-processor', DelayProcessor)
