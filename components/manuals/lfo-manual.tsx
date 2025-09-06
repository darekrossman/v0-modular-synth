'use client'

export default function LFOTManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">
          LFO (Low-Frequency Oscillator)
        </h3>
        <p className="text-muted-foreground">
          Modulation source with multiple shapes, PWM, amplitude, DC offset,
          slew, and per-parameter CV inputs. Outputs bipolar (±5V) and unipolar
          (0..+5V) versions simultaneously.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Shape (buttons)</strong>: Selects wave shape.
          </li>
          <li>
            <strong>Freq (knob)</strong>: Oscillation rate.
          </li>
          <li>
            <strong>Amp (knob)</strong>: Output amplitude.
          </li>
          <li>
            <strong>Oset (knob)</strong>: DC offset applied to the output.
          </li>
          <li>
            <strong>PWM (knob)</strong>: Pulse width for pulse shapes.
          </li>
          <li>
            <strong>Slew (knob)</strong>: Smooths changes, reducing sharp
            transitions.
          </li>
          <li>
            <strong>
              Rate Amt / PWM Amt / AMP Amt / OFFS Amt (mini knobs)
            </strong>
            : Depth for corresponding CV inputs.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>RATE (input, CV)</strong>: Modulates rate; depth via Rate
            Amt.
          </li>
          <li>
            <strong>PWM (input, CV)</strong>: Modulates pulse width; depth via
            PWM Amt.
          </li>
          <li>
            <strong>AMP (input, CV)</strong>: Modulates amplitude; depth via AMP
            Amt.
          </li>
          <li>
            <strong>OFFS (input, CV)</strong>: Modulates DC offset; depth via
            OFFS Amt.
          </li>
          <li>
            <strong>SYNC (input, CV)</strong>: Resets the LFO phase.
          </li>
          <li>
            <strong>UNI (output, CV)</strong>: Unipolar 0..+5V output.
          </li>
          <li>
            <strong>OUT (output, CV)</strong>: Bipolar ±5V output.
          </li>
        </ul>
      </section>
    </div>
  )
}
