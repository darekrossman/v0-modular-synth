'use client'

export default function DelayManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Delay</h3>
        <p className="text-muted-foreground">
          Tempo-syncable stereo delay with mono/stereo/ping‑pong modes, tone
          shaping, feedback, and wet/dry mix. Audio‑rate modulation supported
          for time and feedback via CV inputs.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Mode (buttons)</strong>: Mono, Stereo, or Ping (ping‑pong).
          </li>
          <li>
            <strong>Time (knob)</strong>: Sets delay time. When Sync is enabled,
            selects musical divisions.
          </li>
          <li>
            <strong>fbck (knob)</strong>: Feedback amount.
          </li>
          <li>
            <strong>Tone (knob)</strong>: High‑cut filter in the feedback path.
          </li>
          <li>
            <strong>Mix (knob)</strong>: Wet/dry balance.
          </li>
          <li>
            <strong>Sync/Free (toggle)</strong>: Switch between note‑synced and
            free time.
          </li>
          <li>
            <strong>Fade/Tape (toggle)</strong>: Fade is crossfade‑style, Tape
            is pitch‑shifted time changes.
          </li>
          <li>
            <strong>TIME Amt / FB Amt (mini knobs)</strong>: Depths for the
            corresponding CV inputs.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>CLK (input, CV)</strong>: External clock for Sync mode.
          </li>
          <li>
            <strong>TIME (input, CV)</strong>: Modulates delay time; depth via
            TIME Amt.
          </li>
          <li>
            <strong>FB (input, CV)</strong>: Modulates feedback; depth via FB
            Amt.
          </li>
          <li>
            <strong>IN L / IN R (inputs, audio)</strong>: Audio inputs.
          </li>
          <li>
            <strong>OUT L / OUT R (outputs, audio)</strong>: Processed outputs.
          </li>
        </ul>
      </section>
    </div>
  )
}
