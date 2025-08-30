// Oscilloscope processor - real-time display with trigger stabilization
class ScopeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Config
    this.windowSec = 0.2;
    this.trigLevel = 0.0;
    this.slopeUp = true;
    this.trigSource = 0;
    this.mode = 0;  // 0=AUTO, 1=NORM, 2=SINGLE
    this.outPixels = 400;
    
    // Dynamic ring buffer - size based on window
    this.bufferSize = Math.max(4096, Math.floor(this.windowSec * sampleRate * 1.5));
    this.ring0 = new Float32Array(this.bufferSize);
    this.ring1 = new Float32Array(this.bufferSize);
    this.ring2 = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.samplesWritten = 0;
    
    // Display buffer
    this.display0 = new Float32Array(800);
    this.display1 = new Float32Array(800);
    this.display2 = new Float32Array(800);
    
    // Trigger
    this.lastTriggerIndex = -1;
    this.triggerHoldoff = 0;
    this.framesSinceLastTrigger = 0;
    
    // For SINGLE mode
    this.singleArmed = false;
    this.singleCaptured = false;
    
    // Timing
    this.lastFrameTime = 0;
    this.frameInterval = 16; // ~60fps for smoother display

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === "config") {
        if (typeof d.windowSec === "number") {
          this.windowSec = Math.max(0.005, Math.min(2, d.windowSec));
          // Resize buffer if needed
          const newSize = Math.max(4096, Math.floor(this.windowSec * sampleRate * 1.5));
          if (newSize !== this.bufferSize) {
            this.bufferSize = newSize;
            this.ring0 = new Float32Array(this.bufferSize);
            this.ring1 = new Float32Array(this.bufferSize);
            this.ring2 = new Float32Array(this.bufferSize);
            this.writeIndex = 0;
            this.samplesWritten = 0;
          }
        }
        if (typeof d.trigLevel === "number") this.trigLevel = d.trigLevel;
        if (typeof d.slopeUp === "boolean") this.slopeUp = d.slopeUp;
        if (typeof d.trigSource === "number") this.trigSource = Math.floor(d.trigSource);
        if (typeof d.mode === "number") {
          const prevMode = this.mode;
          this.mode = Math.floor(d.mode);
          if (this.mode !== prevMode) {
            this.singleCaptured = false;
            this.singleArmed = false;
            this.lastTriggerIndex = -1;
          }
        }
        if (typeof d.outPixels === "number") {
          this.outPixels = Math.floor(d.outPixels);
        }
        if (d.armSingle === true) {
          this.singleArmed = true;
          this.singleCaptured = false;
        }
      }
    };
  }

  findTrigger(startIdx, endIdx) {
    const ring = this.trigSource === 0 ? this.ring0 :
                 this.trigSource === 1 ? this.ring1 : this.ring2;
    
    for (let i = startIdx; i < endIdx; i++) {
      const idx = i % this.bufferSize;
      const prevIdx = (i - 1 + this.bufferSize) % this.bufferSize;
      const curr = ring[idx];
      const prev = ring[prevIdx];
      
      const crossed = this.slopeUp ? 
        (prev <= this.trigLevel && curr > this.trigLevel) :
        (prev >= this.trigLevel && curr < this.trigLevel);
      
      if (crossed) {
        return i;
      }
    }
    return -1;
  }

  captureWindow(triggerIdx = -1) {
    const samplesInWindow = Math.floor(this.windowSec * sampleRate);
    const samplesPerPixel = samplesInWindow / this.outPixels;
    
    // Calculate start position
    let startIdx;
    if (triggerIdx >= 0) {
      // Position trigger at 10% from left
      startIdx = triggerIdx - Math.floor(samplesInWindow * 0.1);
    } else {
      // Free run - show most recent samples
      startIdx = this.samplesWritten - samplesInWindow;
    }
    
    // Make sure we have enough samples
    if (startIdx < 0 || this.samplesWritten < samplesInWindow) {
      return false;
    }
    
    // Downsample to display resolution
    for (let px = 0; px < this.outPixels; px++) {
      let sum0 = 0, sum1 = 0, sum2 = 0;
      let count = 0;
      
      const startSample = Math.floor(px * samplesPerPixel);
      const endSample = Math.ceil((px + 1) * samplesPerPixel);
      
      for (let s = startSample; s < endSample && s < samplesInWindow; s++) {
        const idx = (startIdx + s) % this.bufferSize;
        sum0 += this.ring0[idx];
        sum1 += this.ring1[idx];
        sum2 += this.ring2[idx];
        count++;
      }
      
      if (count > 0) {
        this.display0[px] = sum0 / count;
        this.display1[px] = sum1 / count;
        this.display2[px] = sum2 / count;
      }
    }
    
    return true;
  }

  process(inputs, outputs) {
    const in0 = inputs[0]?.[0];
    const in1 = inputs[1]?.[0];
    const in2 = inputs[2]?.[0];
    const out = outputs[0]?.[0];
    
    if (!in0 && !in1 && !in2) return true;
    
    const numSamples = in0?.length || in1?.length || in2?.length || 128;
    
    // Pass through
    if (out && in0) {
      for (let i = 0; i < numSamples; i++) {
        out[i] = in0[i];
      }
    }
    
    // Store samples in ring buffer
    for (let i = 0; i < numSamples; i++) {
      this.ring0[this.writeIndex] = in0 ? in0[i] : 0;
      this.ring1[this.writeIndex] = in1 ? in1[i] : 0;
      this.ring2[this.writeIndex] = in2 ? in2[i] : 0;
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.samplesWritten++;
    }
    
    // Handle trigger holdoff
    if (this.triggerHoldoff > 0) {
      this.triggerHoldoff -= numSamples;
    }
    
    // Check if it's time to update display
    const now = currentTime * 1000;
    if (now - this.lastFrameTime < this.frameInterval) {
      return true;
    }
    this.lastFrameTime = now;
    
    // SINGLE mode - if captured, just show it
    if (this.mode === 2 && this.singleCaptured) {
      this.emitFrame();
      return true;
    }
    
    // Look for trigger if not in holdoff
    let triggerFound = false;
    let triggerIdx = -1;
    
    if (this.triggerHoldoff <= 0) {
      const samplesInWindow = Math.floor(this.windowSec * sampleRate);
      const searchStart = Math.max(0, this.samplesWritten - samplesInWindow);
      const searchEnd = this.samplesWritten;
      
      triggerIdx = this.findTrigger(searchStart, searchEnd);
      triggerFound = triggerIdx >= 0;
      
      if (triggerFound) {
        this.lastTriggerIndex = triggerIdx;
        this.framesSinceLastTrigger = 0;
        // Set holdoff to prevent retriggering
        this.triggerHoldoff = Math.floor(samplesInWindow * 0.5);
      }
    }
    
    // Decide whether to capture based on mode
    let shouldCapture = false;
    
    if (this.mode === 2) {
      // SINGLE mode
      if (this.singleArmed && triggerFound && !this.singleCaptured) {
        shouldCapture = true;
        this.singleCaptured = true;
        this.singleArmed = false;
        this.port.postMessage({ type: "status", status: "latched" });
      }
    } else if (this.mode === 1) {
      // NORM mode - only capture on trigger
      shouldCapture = triggerFound;
    } else {
      // AUTO mode
      if (triggerFound) {
        shouldCapture = true;
      } else {
        // Free run if no trigger for a while
        this.framesSinceLastTrigger++;
        if (this.framesSinceLastTrigger > 3) { // ~50ms at 60fps
          shouldCapture = true;
        }
      }
    }
    
    // Capture and emit if needed
    if (shouldCapture) {
      if (this.captureWindow(triggerFound ? triggerIdx : -1)) {
        this.emitFrame();
      }
    }
    
    return true;
  }
  
  emitFrame() {
    // Send display buffer
    const c0 = this.display0.slice(0, this.outPixels);
    const c1 = this.display1.slice(0, this.outPixels);
    const c2 = this.display2.slice(0, this.outPixels);
    
    this.port.postMessage(
      { 
        type: "frame",
        c0: c0.buffer,
        c1: c1.buffer,
        c2: c2.buffer
      },
      [c0.buffer, c1.buffer, c2.buffer]
    );
  }
}

registerProcessor("scope-processor", ScopeProcessor);