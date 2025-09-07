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
          slew, and per-parameter CV inputs. Outputs bipolar (±5 V) and unipolar
          (0..+10 V) versions simultaneously.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Shape (buttons)</strong>: Selects wave shape.
          </li>
          <li>
            <strong>Freq (knob)</strong>: Oscillation rate (0.5..100 Hz).
          </li>
          <li>
            <strong>Amp (knob)</strong>: Output amplitude (0..2 → ±0..±10 V
            bip).
          </li>
          <li>
            <strong>Oset (knob)</strong>: DC offset applied (−1..+1 → −5..+5 V
            bip).
          </li>
          <li>
            <strong>PWM (knob)</strong>: Pulse width for pulse shapes
            (0.01..0.99).
          </li>
          <li>
            <strong>Slew (knob)</strong>: Smooths changes (0..1).
          </li>
          <li>
            <strong>
              Rate Amt / PWM Amt / AMP Amt / OFFS Amt (mini knobs)
            </strong>
            : Depth for corresponding CV inputs (Rate 0..4, others as labeled:
            PWM 0..1, AMP 0..2, OFFS 0..2).
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>RATE (input, CV)</strong>: Modulates rate; depth via Rate
            Amt. Expected −5..+5 V.
          </li>
          <li>
            <strong>PWM (input, CV)</strong>: Modulates pulse width; depth via
            PWM Amt. Expected −5..+5 V.
          </li>
          <li>
            <strong>AMP (input, CV)</strong>: Modulates amplitude; depth via AMP
            Amt. Expected −5..+5 V.
          </li>
          <li>
            <strong>OFFS (input, CV)</strong>: Modulates DC offset; depth via
            OFFS Amt. Expected −5..+5 V.
          </li>
          <li>
            <strong>SYNC (input, CV)</strong>: Resets the LFO phase (gate ≥ ~2.5
            V).
          </li>
          <li>
            <strong>UNI (output, CV)</strong>: Unipolar 0..+10 V output.
          </li>
          <li>
            <strong>OUT (output, CV)</strong>: Bipolar −5..+5 V (up to ±10 V
            with Amp=2).
          </li>
        </ul>
      </section>
    </div>
  )
}
