'use client'

export default function EuclidManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Euclid</h3>
        <p className="text-muted-foreground">
          Euclidean rhythm generator producing evenly distributed pulses over a
          given number of steps, with rotation, density and accent controls.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Div (knob)</strong>: Clock divider.
          </li>
          <li>
            <strong>Steps (knob)</strong>: Total steps (1..16).
          </li>
          <li>
            <strong>Count (knob)</strong>: Pulses within the pattern (0..steps).
          </li>
          <li>
            <strong>Rotate (knob)</strong>: Rotates pattern start position.
          </li>
          <li>
            <strong>Dens (knob)</strong>: Probability or thinning of pulses.
          </li>
          <li>
            <strong>Acc (knob)</strong>: Accent amount for accent output.
          </li>
          <li>
            <strong>Gate (knob)</strong>: Gate length for pulses.
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
            <strong>RST (input, CV)</strong>: Reset pattern to step 1.
          </li>
          <li>
            <strong>PUL / ROT / DENS / ACC (inputs, CV)</strong>: Modulation for
            corresponding parameters.
          </li>
          <li>
            <strong>GATE (output, CV)</strong>: Pulse/gate output.
          </li>
          <li>
            <strong>ACC (output, CV)</strong>: Accent output.
          </li>
        </ul>
      </section>
    </div>
  )
}
