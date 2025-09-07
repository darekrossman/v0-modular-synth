'use client'

export default function ProcessManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Process</h3>
        <p className="text-muted-foreground">
          CV utility module providing sample/hold functions, track/hold
          variants, and two slew-based processors. It accepts a main CV input
          and a gate input that controls the timing/behavior of the processors.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Slew (knob)</strong>: Base slew rate in ms/V. Higher values
            produce slower motion. Modulated by the <em>SLEW</em> CV input.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Inputs</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>IN (CV)</strong>: Source signal to be processed.
          </li>
          <li>
            <strong>SLEW (CV)</strong>: Modulates slew rate (±10 V ≈ ±1000 ms/V
            offset).
          </li>
          <li>
            <strong>GATE (CV)</strong>: Logic high &gt; 0.5 V used to trigger
            and switch behaviors.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Outputs</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>S&amp;H 1 (CV)</strong>: Samples the <em>IN</em> value on
            each rising edge of <em>GATE</em> and holds it.
          </li>
          <li>
            <strong>S&amp;H 2 (CV)</strong>: A one-step delay of S&amp;H 1,
            updated to the previous S&amp;H 1 value on each rising edge.
            Together S&amp;H 1/2 form a 2-step shift register.
          </li>
          <li>
            <strong>T&amp;H (CV)</strong>: Track-and-hold: tracks <em>IN</em>{' '}
            while
            <em>GATE</em> is low; holds when <em>GATE</em> is high.
          </li>
          <li>
            <strong>H&amp;T (CV)</strong>: Hold-and-track: holds while
            <em>GATE</em> is low; tracks while <em>GATE</em> is high (inverse of
            T&amp;H).
          </li>
          <li>
            <strong>SLEW (CV)</strong>: Slew-limited follower of <em>IN</em>{' '}
            that tracks instantly while <em>GATE</em> is high and slew-limits
            while it is low.
          </li>
          <li>
            <strong>GLIDE (CV)</strong>: Opposite gate logic: tracks while
            <em>GATE</em> is low; slew-limits while it is high. Slew enabling is
            delayed by ~1 ms after a rising edge to avoid clipping early
            changes.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Notes</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Slew amount is specified in ms per volt. For step changes, larger
            values yield slower transitions.
          </li>
          <li>
            Use S&amp;H 1/2 to build simple shift-register melodies or delayed
            modulation streams.
          </li>
          <li>Gate threshold is ~0.5 V; typical 5 V triggers work fine.</li>
        </ul>
      </section>
    </div>
  )
}
