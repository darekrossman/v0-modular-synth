'use client'

export default function SequencerManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Step Sequencer</h3>
        <p className="text-muted-foreground">
          16‑step CV/gate sequencer clocked by an external CLK input. Per‑step
          toggles enable gates; per‑step pitch knobs set 0..1 normalized values.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>rst (button)</strong>: Reset sequence to step 1.
          </li>
          <li>
            <strong>Div (knob)</strong>: Clock divider (1..64).
          </li>
          <li>
            <strong>Oct (knob)</strong>: Octave offset for pitch output.
          </li>
          <li>
            <strong>Gate (knob)</strong>: Gate length as fraction of step.
          </li>
          <li>
            <strong>Step toggles</strong>: Enable/disable gate for each step.
          </li>
          <li>
            <strong>Step pitch knobs</strong>: Per‑step 0..1 pitch values.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>CLK (input, CV)</strong>: External clock.
          </li>
          <li>
            <strong>Reset (input, CV)</strong>: Reset to step 1.
          </li>
          <li>
            <strong>GATE (output, CV)</strong>: Gate stream.
          </li>
          <li>
            <strong>PITCH (output, CV)</strong>: 0..1 normalized pitch; combine
            with octave/transposition as needed in downstream modules.
          </li>
        </ul>
      </section>
    </div>
  )
}
