'use client'

export default function QuantizerManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Quantizer</h3>
        <p className="text-muted-foreground">
          Pitch quantizer that constrains incoming CV to a selectable musical
          scale and key. Supports HOLD (sample-and-hold behavior), transpose and
          octave offsets, and per-note mask editing.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Scale (select)</strong>: Choose musical scale.
          </li>
          <li>
            <strong>Key (select)</strong>: Set root note.
          </li>
          <li>
            <strong>HOLD (toggle)</strong>: Latch on trigger and hold last
            quantized value.
          </li>
          <li>
            <strong>Trans (knob)</strong>: Transpose −12..+12 semitones.
          </li>
          <li>
            <strong>Oct (knob)</strong>: Octave shift −4..+4.
          </li>
          <li>
            <strong>Keyboard mask</strong>: Click notes to include/exclude from
            the scale.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>TRIG (input, CV)</strong>: Triggers HOLD sampling if
            enabled.
          </li>
          <li>
            <strong>PITCH (input, CV)</strong>: Input pitch CV to quantize.
          </li>
          <li>
            <strong>OUT (output, CV)</strong>: Quantized pitch CV output.
          </li>
        </ul>
      </section>
    </div>
  )
}
