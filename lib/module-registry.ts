import type { ComponentType } from 'react'
import { ADSRModule } from '@/components/modules/adsr-module'
import { AttenuverterModule } from '@/components/modules/attenuverter-module'
import { ClockModule } from '@/components/modules/clock-module'
import { DelayModule } from '@/components/modules/delay-module'
import { EuclidModule } from '@/components/modules/euclid-module'
import { KeyboardCVModule } from '@/components/modules/keyboard-cv-module'
import { LFOModule } from '@/components/modules/lfo-module'
import { LowPassFilterModule } from '@/components/modules/lowpass-filter-module'
import { MixerVCAModule } from '@/components/modules/mixer-vca-module'
import { OscillatorModule } from '@/components/modules/oscillator-module'
import { OutputModule } from '@/components/modules/output-module'
import { QuantizerModule } from '@/components/modules/quantizer-module'
import { RandomModule } from '@/components/modules/random-module'
import { ReverbModule } from '@/components/modules/reverb-module'
import { ScopeModule } from '@/components/modules/scope-module'
import { SequencerModule } from '@/components/modules/sequencer-module'
import { VCAModule } from '@/components/modules/vca-module'

export type ModuleType =
  | 'oscillator'
  | 'lfo'
  | 'vca'
  | 'mixer-vca'
  | 'output'
  | 'adsr'
  | 'keyboard-cv'
  | 'lowpass-filter'
  | 'reverb'
  | 'delay'
  | 'scope'
  | 'clock'
  | 'sequencer'
  | 'random'
  | 'quantizer'
  | 'euclid'
  | 'attenuverter'

export interface ModuleInstance {
  id: string
  type: ModuleType
  rack?: number
  order?: number
}

export type ModuleComponent = ComponentType<{ moduleId: string }>

export interface ModuleCatalogEntry {
  type: ModuleType
  name: string
  description: string
  component: ModuleComponent
}

export const availableModules: ModuleCatalogEntry[] = [
  {
    type: 'adsr' as ModuleType,
    name: 'ADSR',
    description: '4-stage envelope generator',
    component: ADSRModule,
  },
  {
    type: 'clock' as ModuleType,
    name: 'Clock',
    description: 'Timing and trigger generator',
    component: ClockModule,
  },
  {
    type: 'delay' as ModuleType,
    name: 'Delay',
    description: 'Delay effect module',
    component: DelayModule,
  },
  {
    type: 'euclid' as ModuleType,
    name: 'Euclid',
    description: 'Euclidean rhythm sequencer',
    component: EuclidModule,
  },
  {
    type: 'keyboard-cv' as ModuleType,
    name: 'Keyboard CV',
    description: 'MIDI keyboard to CV converter',
    component: KeyboardCVModule,
  },
  {
    type: 'lfo' as ModuleType,
    name: 'LFO',
    description: 'Low-frequency oscillator',
    component: LFOModule,
  },
  {
    type: 'lowpass-filter' as ModuleType,
    name: 'Lowpass Filter',
    description: '24db ladder filter',
    component: LowPassFilterModule,
  },
  {
    type: 'oscillator' as ModuleType,
    name: 'VCO',
    description: 'Voltage-controlled oscillator',
    component: OscillatorModule,
  },
  {
    type: 'output' as ModuleType,
    name: 'Output',
    description: 'Stereo audio output',
    component: OutputModule,
  },
  {
    type: 'quantizer' as ModuleType,
    name: 'Quantizer',
    description: 'Pitch CV quantizer',
    component: QuantizerModule,
  },
  {
    type: 'random' as ModuleType,
    name: 'Random',
    description: 'Random voltage generator',
    component: RandomModule,
  },
  {
    type: 'reverb' as ModuleType,
    name: 'Reverb',
    description: 'Stereo reverb effect',
    component: ReverbModule,
  },
  {
    type: 'scope' as ModuleType,
    name: 'Scope',
    description: 'Single-channel oscilloscope',
    component: ScopeModule,
  },
  {
    type: 'sequencer' as ModuleType,
    name: 'Sequencer',
    description: 'Step sequencer for patterns',
    component: SequencerModule,
  },
  {
    type: 'vca' as ModuleType,
    name: 'VCA',
    description: 'Voltage-controlled amplifier',
    component: VCAModule,
  },
  {
    type: 'mixer-vca' as ModuleType,
    name: 'Mixer VCA',
    description: '4-channel mixer with per-channel VCAs and master VCA',
    component: MixerVCAModule,
  },
  {
    type: 'attenuverter' as ModuleType,
    name: 'Attenuverter',
    description: '6-channel attenuverter with normalized inputs',
    component: AttenuverterModule,
  },
]
