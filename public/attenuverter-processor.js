// Attenuverter Processor with Normalization (8-channel)
// Each channel scales its input by a gain factor [-1, 1]
// Normalization:
//   - Channel 0: defaults to 10V when no input connected
//   - Channels 1-7: cascade from channel above when no input connected

class AttenuverterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const params = []
    for (let i = 0; i < 8; i++) {
      params.push({
        name: `g${i}`,
        defaultValue: 0,
        minValue: -1,
        maxValue: 1,
        automationRate: 'k-rate',
      })
      // Mask parameter to track if input is connected (0 or 1)
      params.push({
        name: `m${i}`,
        defaultValue: 0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'k-rate',
      })
    }
    return params
  }

  process(inputs, outputs, parameters) {
    const blockSize = outputs[0]?.[0]?.length ?? 128
    
    // Process each sample in the block
    for (let s = 0; s < blockSize; s++) {
      const sources = new Float32Array(8)
      
      // Determine the source for each channel
      for (let ch = 0; ch < 8; ch++) {
        const input = inputs[ch]?.[0]
        const mask = parameters[`m${ch}`][0] ?? 0
        
        if (mask > 0.5 && input) {
          // Input is connected - use it
          sources[ch] = input[s]
        } else if (ch === 0) {
          // First channel with no input - normalize to 10V
          sources[ch] = 10
        } else {
          // Other channels with no input - cascade from above
          sources[ch] = sources[ch - 1]
        }
      }
      
      // Apply gains and output
      for (let ch = 0; ch < 8; ch++) {
        const output = outputs[ch]?.[0]
        const gain = parameters[`g${ch}`][0] ?? 0
        
        if (output) {
          output[s] = sources[ch] * gain
        }
      }
    }

    return true
  }
}

registerProcessor('attenuverter-processor', AttenuverterProcessor)