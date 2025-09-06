'use client'

export default function AttenuverterManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Attenuverter</h3>
        <p className="text-muted-foreground">
          8‑channel attenuverter/mixer utility. Each channel accepts audio or
          CV, applies a gain of −1..+1 via its knob, and outputs the result.
          Channels are independent; use them for scaling, inversion, and basic
          mixing.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>8x Knobs</strong>: Per‑channel gain from −1 (inverted)
            through 0 to +1.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i}>
              <strong>CH{i + 1} IN (input, any)</strong> →{' '}
              <strong>CH{i + 1} OUT (output, any)</strong>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
