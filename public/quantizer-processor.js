// quantizer-processor.js
// Input 0: Pitch CV (Volts, 1V/oct)
// Input 1: Trigger/Gate (0..5V), optional
// Output 0: Quantized Pitch CV (Volts)
//
// Params (k-rate):
//  - key: 0..11 (C=0, C#=1, ..., B=11)
//  - hold: 0/1 (1 = update only on trigger rising edges)
// Messages:
//  - { type: 'scale', mask12: number }  // 12-bit mask of allowed notes (LSB=C)

class QuantizerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'key', defaultValue: 0, minValue: 0, maxValue: 11, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'transpose', defaultValue: 0, minValue: -96, maxValue: 96, automationRate: 'k-rate' },
    ]
  }

  constructor() {
    super()
    this.mask12 = 0xFFF // default: chromatic (all on)
    this.lastTrig = 0
    this.latchedVolts = 0

    this.port.onmessage = (e) => {
      const d = e.data || {}
      if (d.type === 'scale' && typeof d.mask12 === 'number') {
        this.mask12 = d.mask12 & 0xFFF
        if (this.mask12 === 0) this.mask12 = 0xFFF
      }
    }
  }

  // Find nearest allowed semitone (0..11) to 'note' (0..11 float), given key rotation
  nearestInScale(note, key) {
    // Rotate mask by key
    const mask = ((this.mask12 << key) | (this.mask12 >>> (12 - key))) & 0xFFF
    let best = 0
    let bestDist = 1e9
    for (let n = 0; n < 12; n++) {
      if (((mask >> n) & 1) === 0) continue
      // distance on circular chroma (choose nearest direction)
      let d = Math.abs(n - note)
      if (d > 6) d = 12 - d
      if (d < bestDist || (d === bestDist && n >= note)) { // bias to upwards on tie
        bestDist = d
        best = n
      }
    }
    return best
  }

  quantizeVolts(volts, key) {
    // Convert voltage to semitones (1V/oct standard)
    const inputSemitones = volts * 12
    
    // Get the rotated scale mask for the current key
    const mask = ((this.mask12 << key) | (this.mask12 >>> (12 - key))) & 0xFFF
    
    // Build array of valid notes in the scale
    const validNotes = []
    for (let i = 0; i < 12; i++) {
      if ((mask >> i) & 1) {
        validNotes.push(i)
      }
    }
    
    // If no valid notes, return input unchanged
    if (validNotes.length === 0) return volts
    
    // Find the closest valid note across all octaves
    // We'll check the current octave and adjacent ones to avoid discontinuities
    const centerOctave = Math.floor(inputSemitones / 12)
    let bestSemitone = centerOctave * 12
    let bestDistance = Infinity
    
    // Check octaves around the current position
    for (let oct = centerOctave - 1; oct <= centerOctave + 1; oct++) {
      for (const note of validNotes) {
        const candidate = oct * 12 + note
        const distance = Math.abs(candidate - inputSemitones)
        if (distance < bestDistance) {
          bestDistance = distance
          bestSemitone = candidate
        }
      }
    }
    
    // Convert back to voltage
    return bestSemitone / 12
  }

  process(inputs, outputs, parameters) {
    const pitchIn = inputs[0] && inputs[0][0] ? inputs[0][0] : null
    const trigIn = inputs[1] && inputs[1][0] ? inputs[1][0] : null
    const out = outputs[0] && outputs[0][0] ? outputs[0][0] : null
    if (!out) return true

    const n = out.length
    const key = Math.round(parameters.key[0] || 0) % 12
    const hold = (parameters.hold[0] || 0) > 0.5
    const transpose = Math.round(parameters.transpose[0] || 0) // semitones

    for (let i = 0; i < n; i++) {
      let src = this.latchedVolts
      if (pitchIn) src = pitchIn[i]

      if (hold) {
        const t = trigIn ? trigIn[i] : 0
        const rising = this.lastTrig < 2.5 && t >= 2.5
        if (rising) {
          this.latchedVolts = this.quantizeVolts(src, key)
        }
        this.lastTrig = t
        out[i] = this.latchedVolts + transpose / 12
      } else {
        out[i] = this.quantizeVolts(src, key) + transpose / 12
      }
    }

    return true
  }
}

registerProcessor('quantizer-processor', QuantizerProcessor)
