'use client'

export default function DelayManual() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <section>
        <h3 className="text-base font-semibold">Delay</h3>
        <p className="text-muted-foreground">
          True‑stereo, matrix‑topology delay. Works with mono or stereo inputs,
          offers tempo sync, tone shaping, feedback, and wet/dry mix. The stereo
          matrix lets you blend between parallel stereo, cross‑feed, and
          ping‑pong behaviors. Audio‑rate modulation is supported for Time and
          Feedback.
        </p>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Controls</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Mode (buttons)</strong>: Mono, Stereo, or Ping (ping‑pong).
            These are presets for the stereo matrix:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>
                <strong>Mono</strong>: XIn=0, XFd=0, Width=0, Spread centered,
                Link on. Wet input is treated mono for classic mono delay.
              </li>
              <li>
                <strong>Stereo</strong>: XIn=0, XFd=0, Width=1, Spread centered,
                Link on. Independent L/R.
              </li>
              <li>
                <strong>Ping</strong>: XIn=1, XFd=1, Width=1, Spread centered,
                Link on. Guarantees first echo hits the opposite side (works
                great with stereo inputs).
              </li>
            </ul>
          </li>
          <li>
            <strong>Time (knob)</strong>: Sets delay time (0.01..2.0 s). When
            Sync is enabled, selects musical divisions.
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
          <li>
            <strong>XIn (knob)</strong>: Cross‑Input, 0..1. How much of each
            input channel is written to the opposite delay line. 0 = inputs stay
            on their side; 1 = inputs write fully to the opposite side (first
            echo appears opposite; ideal for ping‑pong with stereo sources).
          </li>
          <li>
            <strong>XFd (knob)</strong>: Crossfeed, 0..1. How much of each
            delay’s feedback crosses to the other side. 0 = parallel stereo
            (L→L, R→R). 1 = pure ping‑pong (L→R, R→L). Values in between create
            stereo interaction and widening.
          </li>
          <li>
            <strong>Width (knob)</strong>: Wet‑only stereo width, 0..1. 0 = mono
            wet; 1 = full width. Dry path remains unchanged.
          </li>
          <li>
            <strong>Spread (knob)</strong>: Time spread between left and right.
            Internally maps to −50%..+50% around the base Time.
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>
                <strong>Link on</strong>: symmetric around Time (L = Time×(1−S),
                R = Time×(1+S)).
              </li>
              <li>
                <strong>Link off</strong>: Right is spread from Time (L = Time,
                R = Time×(1+S)).
              </li>
            </ul>
          </li>
          <li>
            <strong>Link (toggle)</strong>: Links/unlinks left and right delay
            times for Spread behavior (see above).
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Ports</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>CLK (input, CV)</strong>: External clock for Sync mode. The
            processor measures rising edges at 48 PPQ (one quarter‑note = 48
            pulses). Use the Time knob in Sync to pick subdivisions/multiples
            (1/64 → 8/1).
          </li>
          <li>
            <strong>TIME (input, CV)</strong>: Modulates delay time with −1..+1
            normalized CV; depth via TIME Amt.
          </li>
          <li>
            <strong>FB (input, CV)</strong>: Modulates feedback with −1..+1
            normalized CV; depth via FB Amt.
          </li>
          <li>
            <strong>IN L / IN R (inputs, audio)</strong>: Audio inputs (±10 V
            safe). With exactly one input connected, the module auto‑balances
            the dry signal to both outputs and treats the wet input as mono in
            Mono mode (and by default when only one side is present), unless you
            shape stereo via XIn/XFd.
          </li>
          <li>
            <strong>OUT L / OUT R (outputs, audio)</strong>: Processed outputs
            (stereo).
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">How the stereo matrix works</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Input mixing</strong>: xinL = (1−XIn)·inL + XIn·inR; xinR =
            XIn·inL + (1−XIn)·inR.
          </li>
          <li>
            <strong>Feedback matrix</strong>: self = FB×(1−XFd), cross = FB×XFd.
            fbL = self·tapL + cross·tapR; fbR = self·tapR + cross·tapL.
          </li>
          <li>
            <strong>Wet width</strong>: applied in mid/side on the wet signal
            only; dry is unaffected.
          </li>
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-semibold">Tips</h4>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Lush stereo</strong>: Stereo mode, XFd≈0.2–0.4, Width=1,
            Spread≈+0.05.
          </li>
          <li>
            <strong>Classic ping‑pong</strong>: Ping mode. Adjust Time/FB/Tone;
            add small Spread for motion.
          </li>
          <li>
            <strong>Slapback mono</strong>: Mono mode, Time≈80–120 ms, Width=0,
            XIn=0, XFd=0.
          </li>
          <li>
            <strong>Rhythmic interplay</strong>: Stereo mode, Sync on, a touch
            of XFd, and small Spread.
          </li>
        </ul>
      </section>
    </div>
  )
}
