'use client'

export default function LowpassFilterManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Filter (24 dB Lowpass)</h3>
        <p className="text-muted-foreground">
          Monophonic ladder-style lowpass filter with audio-rate cutoff and
          resonance modulation. Cutoff is mapped logarithmically for musical
          control. CV attenuation per-parameter lets you scale external control
          precisely.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Cutoff (knob)</strong>: Sets the cutoff frequency.
          </li>
          <li>
            <strong>Res (knob)</strong>: Resonance amount; higher values
            emphasize frequencies near the cutoff.
          </li>
          <li>
            <strong>CV Amt (mini knob)</strong>: Depth for the Cutoff CV input.
          </li>
          <li>
            <strong>RES Amt (mini knob)</strong>: Depth for the Resonance CV
            input.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>IN (input, audio)</strong>: Audio to be filtered.
          </li>
          <li>
            <strong>freq (input, CV)</strong>: Modulates cutoff; depth via CV
            Amt.
          </li>
          <li>
            <strong>RES (input, CV)</strong>: Modulates resonance; depth via RES
            Amt.
          </li>
          <li>
            <strong>OUT (output, audio)</strong>: Filtered signal.
          </li>
        </ul>
      </section>
    </div>
  )
}
