'use client'

export default function ClockManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Clock</h3>
        <p className="text-muted-foreground">
          Master tempo source with run/stop, BPM control, a 48 PPQ clock output
          and four user‑selectable divider outputs.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>run/stop (toggle)</strong>: Starts/stops the clock.
          </li>
          <li>
            <strong>Tempo (knob)</strong>: Sets BPM (20..280).
          </li>
          <li>
            <strong>Div1..Div4 (knobs)</strong>: Select divisions for four
            outputs (1/32..8/1).
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>clk (output, CV)</strong>: 48 PPQ master clock pulse.
          </li>
          <li>
            <strong>DIV1..DIV4 (outputs, CV)</strong>: Divider pulses per
            selected ratio.
          </li>
        </ul>
      </section>
    </div>
  )
}
