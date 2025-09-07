'use client'

export default function OutputManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Output</h3>
        <p className="text-muted-foreground">
          Final stereo output with metering, soft clipper, and limiter. Includes
          peak-hold and clip indicators, and a volume control mapped to a
          musically useful range.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Volume (knob)</strong>: Adjusts output level (approx −∞..0
            dB → +6 dB headroom).
          </li>
          <li>
            <strong>Enable/Disable (button)</strong>: Soft-start/stop the master
            output.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Meters</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>RMS bars</strong>: Real-time loudness for L/R.
          </li>
          <li>
            <strong>Peak-hold</strong>: Captures recent peaks for visual
            reference.
          </li>
          <li>
            <strong>Clip LEDs</strong>: Latches when clipping is detected.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>L (input, audio)</strong>: Left input channel (±10 V safe).
          </li>
          <li>
            <strong>R (input, audio)</strong>: Right input channel (±10 V safe).
          </li>
        </ul>
      </section>
    </div>
  )
}
