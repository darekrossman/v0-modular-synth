'use client'

export default function VCAManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">VCA</h3>
        <p className="text-muted-foreground">
          Mono voltage‑controlled amplifier for shaping audio/CV amplitude.
          Accepts a main CV and an additional CV level input. Internal slew and
          DC blocking keep output stable when modulated.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Offset (slider)</strong>: Base gain level (0..1).
          </li>
          <li>
            <strong>Lvl (mini knob)</strong>: Amount applied to the CV input.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>CV (input, CV)</strong>: Main modulation signal.
          </li>
          <li>
            <strong>Lvl (input, CV)</strong>: CV that scales the CV amount.
          </li>
          <li>
            <strong>IN (input, audio)</strong>: Audio (or CV) to be amplified.
          </li>
          <li>
            <strong>OUT (output, audio)</strong>: Amplified signal.
          </li>
        </ul>
      </section>
    </div>
  )
}
