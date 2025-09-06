'use client'

export default function RandomManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Random</h3>
        <p className="text-muted-foreground">
          Six independent random CV generators. Each channel produces a new
          value when triggered and outputs a scaled/offset voltage.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>lvl (knob per channel)</strong>: Attenuation (0..1) for the
            random value.
          </li>
          <li>
            <strong>oset (knob per channel)</strong>: Offset mapping 0..1 →
            −5..+5 V.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <strong>Trig (input, CV)</strong> CH{i + 1}: Triggers a new random
              value →<strong> OUT (output, CV)</strong> CH{i + 1}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
