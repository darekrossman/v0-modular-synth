import type { ComponentType } from 'react'
import ADSRManual from '@/components/manuals/adsr-manual'
import AttenuverterManual from '@/components/manuals/attenuverter-manual'
import ClockManual from '@/components/manuals/clock-manual'
import DelayManual from '@/components/manuals/delay-manual'
import EuclidManual from '@/components/manuals/euclid-manual'
import KeyboardCVManual from '@/components/manuals/keyboard-cv-manual'
import LFOTManual from '@/components/manuals/lfo-manual'
import LowpassFilterManual from '@/components/manuals/lowpass-filter-manual'
import MixerVCAManual from '@/components/manuals/mixer-vca-manual'
import OscillatorManual from '@/components/manuals/oscillator-manual'
import OutputManual from '@/components/manuals/output-manual'
import ProcessManual from '@/components/manuals/process-manual'
import QuantizerManual from '@/components/manuals/quantizer-manual'
import RandomManual from '@/components/manuals/random-manual'
import ReverbManual from '@/components/manuals/reverb-manual'
import ScopeManual from '@/components/manuals/scope-manual'
import SequencerManual from '@/components/manuals/sequencer-manual'
import VCAManual from '@/components/manuals/vca-manual'
import type { ModuleType } from '@/lib/module-registry'

export const manuals: Partial<Record<ModuleType, ComponentType>> = {
  oscillator: OscillatorManual,
  'keyboard-cv': KeyboardCVManual,
  lfo: LFOTManual,
  'lowpass-filter': LowpassFilterManual,
  adsr: ADSRManual,
  output: OutputManual,
  delay: DelayManual,
  reverb: ReverbManual,
  attenuverter: AttenuverterManual,
  scope: ScopeManual,
  random: RandomManual,
  sequencer: SequencerManual,
  euclid: EuclidManual,
  quantizer: QuantizerManual,
  vca: VCAManual,
  'mixer-vca': MixerVCAManual,
  clock: ClockManual,
  process: ProcessManual,
}
