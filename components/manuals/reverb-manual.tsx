'use client'

export default function ReverbManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Reverb</h3>
        <p className="text-muted-foreground">
          Algorithmic stereo reverb (Room, Hall, Plate) with size, decay,
          pre‑delay, damping, and wet/dry mix. All primary parameters have CV
          inputs with per‑parameter depth controls.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Algo (buttons)</strong>: Room, Hall, or Plate.
          </li>
          <li>
            <strong>Size (knob)</strong>: Virtual room size (0.3..2.0 scale).
          </li>
          <li>
            <strong>Decay (knob)</strong>: Reverb feedback (0..0.98 internal
            gain).
          </li>
          <li>
            <strong>Pre (knob)</strong>: Pre‑delay (0..0.25 s).
          </li>
          <li>
            <strong>Tone (knob)</strong>: High‑frequency damping cutoff
            (200..16,000 Hz).
          </li>
          <li>
            <strong>Mix (knob)</strong>: Wet/dry balance (0..1 equal‑power).
          </li>
          <li>
            <strong>SIZE/TONE/DECAY/MIX Amt (mini knobs)</strong>: Depths for
            the respective CV inputs.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>IN L / IN R (inputs, audio)</strong>: Audio inputs (±10 V
            safe; mono handled).
          </li>
          <li>
            <strong>SIZE / TONE / DECAY / MIX (inputs, CV)</strong>: CV mod
            inputs.
          </li>
          <li>
            <strong>OUT L / OUT R (outputs, audio)</strong>: Reverb outputs.
          </li>
        </ul>
      </section>
    </div>
  )
}
