'use client'

export default function KeyboardCVManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Keyboard CV</h3>
        <p className="text-muted-foreground">
          Converts your computer keyboard and on-screen piano into
          modular-friendly control signals. Outputs a 1V/Oct pitch CV and a 0/5V
          gate. Press the on-screen keys or your computer keys (AWSEDFTGYHUJ) to
          play.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Computer Mapping</h4>
        <p className="text-muted-foreground">
          White keys: A S D F G H J. Black keys: W E — T Y U.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Gate (output, CV)</strong>: 0 V when idle, 5 V while a key
            is held.
          </li>
          <li>
            <strong>Pitch (output, CV)</strong>: 1 V/Oct pitch CV. Middle C
            range is centered around −1..+1 V span for the mapped octave.
          </li>
        </ul>
      </section>
    </div>
  )
}
