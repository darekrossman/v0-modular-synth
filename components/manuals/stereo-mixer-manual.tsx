'use client'

export default function StereoMixerManual() {
  return (
    <div className="text-sm leading-5 space-y-2">
      <p>
        6-channel stereo mixer with per-channel VCAs, two stereo sends/returns,
        pan, width, mute, and a master mix VCA. Channel sliders act as VCA
        offset when no CV is patched, and as CV attenuators when CV is patched.
      </p>
      <ul className="list-disc pl-4">
        <li>
          Ports: 12 channel inputs (L/R ×6), 6 CV ins, Mix CV in, 2× stereo
          returns, 2× stereo sends, stereo mix out.
        </li>
        <li>
          Sends can be toggled pre/post-fader per channel. Global option: Mute
          affects sends.
        </li>
        <li>
          Sliders and masters provide up to +12 dB headroom near the top of
          travel.
        </li>
        <li>
          Pan is equal-power; if only the left input is connected, the channel
          is treated as mono.
        </li>
        <li>
          Optional soft clip on master bus (Clip knob) blends in gentle
          limiting.
        </li>
      </ul>
    </div>
  )
}
