/* eslint-disable import/no-unresolved, import/no-extraneous-dependencies */
// AudioWorklet global context - these are available natively in worklet threads

declare global {
  // AudioWorklet native globals - DO NOT IMPORT
  var sampleRate: number
  var currentFrame: number
  var currentTime: number

  function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void

  class AudioWorkletProcessor {
    readonly port: MessagePort
    static get parameterDescriptors(): AudioParamDescriptor[]
    constructor(options?: AudioWorkletNodeOptions)
    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
  }
}

// Declare AudioParamDescriptor before using it
interface AudioParamDescriptor {
  name: string
  defaultValue: number
  minValue: number
  maxValue: number
  automationRate: AutomationRate
}

// Prevent this file from being treated as a module
export {}
