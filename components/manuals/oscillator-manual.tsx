'use client'

import type React from 'react'

export default function OscillatorManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">
          VCO (Voltage-Controlled Oscillator)
        </h3>
        <p className="text-muted-foreground">
          The VCO generates periodic waveforms for your patch and supports
          audio-rate features: hard sync, PWM, waveform morphing, and
          exponential FM. Saw and square employ PolyBLEP band-limiting to reduce
          aliasing at higher frequencies. FM accepts CV or audio-rate signals.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Waveforms</h4>
        <ul className="list-disc pl-5">
          <li>
            <strong>Sine</strong>: Pure tone.
          </li>
          <li>
            <strong>Square</strong>: Pulse with variable width (PWM).
          </li>
          <li>
            <strong>Sawtooth</strong>: Bright, rich in harmonics.
          </li>
          <li>
            <strong>Triangle</strong>: Soft, fewer upper harmonics.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Waveform (buttons)</strong>: Selects sine, square, saw, or
            triangle.
          </li>
          <li>
            <strong>Octave (knob)</strong>: Sets octave offset (−4..+4).
          </li>
          <li>
            <strong>Tune (knob)</strong>: Fine tune in cents (−600..+600).
          </li>
          <li>
            <strong>Sync (knob)</strong>: Amount of hard-sync reset when a
            rising edge is received at the Sync input (gate ≥ ~2.5 V). At higher
            values, resets are stronger.
          </li>
          <li>
            <strong>PWM (knob)</strong>: Base pulse width for the square wave
            (0.01..0.99).
          </li>
          <li>
            <strong>FM Amt (mini knob)</strong>: Depth for the FM input
            (exponential FM). Accepts CV or audio-rate modulation.
          </li>
          <li>
            <strong>Morph CV Amt (mini knob)</strong>: Depth for the Morph CV
            input. Morphs from the current waveform toward the next waveform in
            the selector.
          </li>
          <li>
            <strong>PWM CV Amt (mini knob)</strong>: Depth for the PWM CV input
            around the base PWM setting.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Note (input, CV)</strong>: 1 V/Oct pitch input (−10..+10 V
            typical), exponential mapping.
          </li>
          <li>
            <strong>Sync (input, audio)</strong>: Hard-sync trigger. Rising
            edges (or zero-crossings in audio) cause phase resets. Amount set by
            the Sync knob.
          </li>
          <li>
            <strong>FM (input, CV/Audio)</strong>: Exponential FM. Accepts CV or
            audio-rate signals (−1..+1 normalized). Depth set by FM Amt.
          </li>
          <li>
            <strong>Morph (input, CV)</strong>: Modulates waveform morph toward
            the next waveform. Depth set by Morph CV Amt.
          </li>
          <li>
            <strong>PWM (input, CV)</strong>: Modulates pulse width around the
            base PWM setting. Depth set by PWM CV Amt.
          </li>
          <li>
            <strong>Out (output, audio)</strong>: Oscillator audio output
            (≈−5..+5 V).
          </li>
        </ul>
      </section>
    </div>
  )
}
