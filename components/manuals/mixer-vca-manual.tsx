'use client'

export default function MixerVCAManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Mixer VCA</h3>
        <p className="text-muted-foreground">
          4‑channel mixer with per‑channel VCAs and a master mix bus. Each
          channel has audio input, CV input, and a post‑VCA level slider. The
          mix output can be voltage‑controlled and switched between linear/exp.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>CH1..CH4 (sliders)</strong>: Post‑VCA channel levels.
          </li>
          <li>
            <strong>Mix (knob)</strong>: Master gain scalar (0.5→1x, 1.0→2x).
          </li>
          <li>
            <strong>Lin/Exp (toggle)</strong>: Response curve for VCAs.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <strong>IN{i + 1} (input, any)</strong>,{' '}
              <strong>CV{i + 1} (input, CV)</strong>,
              <strong> OUT{i + 1} (output, any)</strong>
            </li>
          ))}
          <li>
            <strong>Mix CV (input, CV)</strong>: Modulates master mix VCA.
          </li>
          <li>
            <strong>MIX (output, any)</strong>: Combined mix output.
          </li>
        </ul>
      </section>
    </div>
  )
}
