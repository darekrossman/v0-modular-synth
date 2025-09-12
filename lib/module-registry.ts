import type { ComponentType } from 'react'
import { ADSRModule } from '@/components/modules/adsr-module'
import { AttenuverterModule } from '@/components/modules/attenuverter-module'
import { ClockModule } from '@/components/modules/clock-module'
import { DelayModule } from '@/components/modules/delay-module'
import { EuclidModule } from '@/components/modules/euclid-module'
import { KeyboardCVModule } from '@/components/modules/keyboard-cv-module'
import { KickModule } from '@/components/modules/kick-module'
import { LFOModule } from '@/components/modules/lfo-module'
import { LowPassFilterModule } from '@/components/modules/lowpass-filter-module'
import { MixerVCAModule } from '@/components/modules/mixer-vca-module'
import { OscillatorModule } from '@/components/modules/oscillator-module'
import { OutputModule } from '@/components/modules/output-module'
import { ProcessModule } from '@/components/modules/process-module'
import { QuantizerModule } from '@/components/modules/quantizer-module'
import { RandomModule } from '@/components/modules/random-module'
import { ReverbModule } from '@/components/modules/reverb-module'
import { ScopeModule } from '@/components/modules/scope-module'
import { SequencerModule } from '@/components/modules/sequencer-module'
import { StereoMixerModule } from '@/components/modules/stereo-mixer-module'
import { SVFFilterModule } from '@/components/modules/svf-filter-module'
import { VCAModule } from '@/components/modules/vca-module'

export type ModuleType =
  | 'oscillator'
  | 'lfo'
  | 'vca'
  | 'mixer-vca'
  | 'stereo-mixer'
  | 'output'
  | 'adsr'
  | 'keyboard-cv'
  | 'lowpass-filter'
  | 'svf-filter'
  | 'reverb'
  | 'delay'
  | 'scope'
  | 'clock'
  | 'sequencer'
  | 'random'
  | 'quantizer'
  | 'euclid'
  | 'attenuverter'
  | 'process'
  | 'kick'

export interface ModuleInstance {
  id: string
  type: ModuleType
  rack?: number
  order?: number
  x?: number
  xHp?: number
  hp?: number
}

export type ModuleComponent = ComponentType<{ moduleId: string }>

export interface ModuleCatalogEntry {
  type: ModuleType
  name: string
  description: string
  component: ModuleComponent
  hp: number
}

export const availableModules: ModuleCatalogEntry[] = [
  {
    type: 'adsr' as ModuleType,
    name: 'ADSR',
    description: '4-stage envelope generator',
    component: ADSRModule,
    hp: 9,
  },
  {
    type: 'clock' as ModuleType,
    name: 'Clock',
    description: 'Timing and trigger generator',
    component: ClockModule,
    hp: 9,
  },
  {
    type: 'delay' as ModuleType,
    name: 'Delay',
    description: 'Delay effect module',
    component: DelayModule,
    hp: 9,
  },
  {
    type: 'euclid' as ModuleType,
    name: 'Euclid',
    description: 'Euclidean rhythm sequencer',
    component: EuclidModule,
    hp: 9,
  },
  {
    type: 'keyboard-cv' as ModuleType,
    name: 'Keyboard CV',
    description: 'MIDI keyboard to CV converter',
    component: KeyboardCVModule,
    hp: 9,
  },
  {
    type: 'lfo' as ModuleType,
    name: 'LFO',
    description: 'Low-frequency oscillator',
    component: LFOModule,
    hp: 9,
  },
  {
    type: 'lowpass-filter' as ModuleType,
    name: 'Lowpass Filter',
    description: '24db ladder filter',
    component: LowPassFilterModule,
    hp: 9,
  },
  {
    type: 'filter' as ModuleType,
    name: 'Filter',
    description: 'State-variable filter with LP/HP outs',
    component: SVFFilterModule,
    hp: 9,
  },
  {
    type: 'oscillator' as ModuleType,
    name: 'VCO',
    description: 'Voltage-controlled oscillator',
    component: OscillatorModule,
    hp: 9,
  },
  {
    type: 'output' as ModuleType,
    name: 'Output',
    description: 'Stereo audio output',
    component: OutputModule,
    hp: 9,
  },
  {
    type: 'quantizer' as ModuleType,
    name: 'Quantizer',
    description: 'Pitch CV quantizer',
    component: QuantizerModule,
    hp: 9,
  },
  {
    type: 'random' as ModuleType,
    name: 'Random',
    description: 'Random voltage generator',
    component: RandomModule,
    hp: 9,
  },
  {
    type: 'reverb' as ModuleType,
    name: 'Reverb',
    description: 'Stereo reverb effect',
    component: ReverbModule,
    hp: 9,
  },
  {
    type: 'scope' as ModuleType,
    name: 'Scope',
    description: 'Single-channel oscilloscope',
    component: ScopeModule,
    hp: 16,
  },
  {
    type: 'sequencer' as ModuleType,
    name: 'Sequencer',
    description: 'Step sequencer for patterns',
    component: SequencerModule,
    hp: 9,
  },
  {
    type: 'vca' as ModuleType,
    name: 'VCA',
    description: 'Voltage-controlled amplifier',
    component: VCAModule,
    hp: 9,
  },
  {
    type: 'mixer-vca' as ModuleType,
    name: 'Mixer VCA',
    description: '4-channel mixer with per-channel VCAs and master VCA',
    component: MixerVCAModule,
    hp: 9,
  },
  {
    type: 'stereo-mixer' as ModuleType,
    name: 'Stereo Mixer',
    description: '6-ch stereo mixer, 2 sends/returns, VCAs',
    component: StereoMixerModule,
    hp: 9,
  },
  {
    type: 'attenuverter' as ModuleType,
    name: 'Attenuverter',
    description: '6-channel attenuverter with normalized inputs',
    component: AttenuverterModule,
    hp: 9,
  },
  {
    type: 'process' as ModuleType,
    name: 'Process',
    description: 'CV utilities: S&H, T&H, H&T, Slew, Glide',
    component: ProcessModule,
    hp: 9,
  },
  {
    type: 'kick' as ModuleType,
    name: 'Kick',
    description: 'Analog 808/909 kick drum',
    component: KickModule,
    hp: 9,
  },
]
