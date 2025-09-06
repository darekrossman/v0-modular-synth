'use client'

export default function ADSRManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">ADSR Envelope</h3>
        <p className="text-muted-foreground">
          Four-stage envelope generator with retrigger, long mode, linear shape,
          manual trigger, level scaling, and both normal and inverted outputs.
          Accepts external 0/5V gates and provides stable, audio-rate capable
          parameter updates.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>A / D / S / R (vertical sliders)</strong>: Set attack,
            decay, sustain, and release times/levels.
          </li>
          <li>
            <strong>Rtrig (toggle)</strong>: When on, restarting a gate
            retriggers from the attack stage.
          </li>
          <li>
            <strong>Long (toggle)</strong>: Extends the time ranges for longer
            envelopes.
          </li>
          <li>
            <strong>Lin (toggle)</strong>: Linear curve shaping (vs.
            exponential).
          </li>
          <li>
            <strong>Lvl (knob)</strong>: Scales maximum envelope level (maxV).
          </li>
          <li>
            <strong>Trig (button)</strong>: Manual gate; press and hold to fire
            the envelope.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Gate (input, CV)</strong>: 0/5V gate input that triggers the
            envelope.
          </li>
          <li>
            <strong>Out (output, CV)</strong>: Main envelope output.
          </li>
          <li>
            <strong>INV (output, CV)</strong>: Inverted envelope output.
          </li>
        </ul>
      </section>
    </div>
  )
}
