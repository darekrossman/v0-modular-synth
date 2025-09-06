'use client'

export default function ScopeManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Scope</h3>
        <p className="text-muted-foreground">
          Dual‑channel oscilloscope for visualizing CV and audio. Supports time
          and voltage scaling, trigger level, trigger source selection, and
          auto‑triggering. Efficient rendering with min/max reduction.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>time (knob)</strong>: Window length (time/div).
          </li>
          <li>
            <strong>V/Div (knob)</strong>: Vertical scale per division.
          </li>
          <li>
            <strong>Trig (knob)</strong>: Trigger level.
          </li>
          <li>
            <strong>Trig (button)</strong>: Enable/disable triggering.
          </li>
          <li>
            <strong>CH1 / CH2 (buttons)</strong>: Select trigger source.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>CH1 (input, any)</strong>: Channel 1 input.
          </li>
          <li>
            <strong>CH2 (input, any)</strong>: Channel 2 input.
          </li>
        </ul>
      </section>
    </div>
  )
}
