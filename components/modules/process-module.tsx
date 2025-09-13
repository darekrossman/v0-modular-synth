'use client'

import { useEffect, useRef, useState } from 'react'
import { ModuleContainer } from '@/components/module-container'
import { useModulePatch } from '@/components/patch-manager'
import { Port, PortGroup } from '@/components/port'
import { Knob } from '@/components/ui/knob'
import { useModuleInit } from '@/hooks/use-module-init'
import { getAudioContext } from '@/lib/helpers'

const SLEW_MS_MIN = 0
const SLEW_MS_MAX = 1000
const toMs = (t: number) => SLEW_MS_MIN + t * (SLEW_MS_MAX - SLEW_MS_MIN)
const fromMs = (ms: number) =>
  (ms - SLEW_MS_MIN) / (SLEW_MS_MAX - SLEW_MS_MIN || 1)

export function ProcessModule({ moduleId }: { moduleId: string }) {
  // persistence
  const { initialParameters } = useModulePatch(moduleId, () => ({
    slewMs: toMs(slew[0]),
  }))
  const [slew, setSlew] = useState([fromMs(initialParameters?.slewMs ?? 50)])

  // audio graph refs
  const acRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)

  // inputs
  const inRef = useRef<GainNode | null>(null)
  const gateRef = useRef<GainNode | null>(null)
  const slewCvRef = useRef<GainNode | null>(null)

  // outputs
  const sh1Ref = useRef<GainNode | null>(null)
  const sh2Ref = useRef<GainNode | null>(null)
  const thRef = useRef<GainNode | null>(null)
  const htRef = useRef<GainNode | null>(null)
  const slewOutRef = useRef<GainNode | null>(null)
  const glideRef = useRef<GainNode | null>(null)
  const keepAliveRef = useRef<GainNode | null>(null)

  useModuleInit(async () => {
    if (nodeRef.current) return
    const ac = getAudioContext()
    acRef.current = ac
    await ac.audioWorklet.addModule('/process-processor.js')

    const mkIn = () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    }
    inRef.current = mkIn()
    gateRef.current = mkIn()
    slewCvRef.current = mkIn()

    const node = new AudioWorkletNode(ac, 'process-processor', {
      numberOfInputs: 3,
      numberOfOutputs: 6,
      outputChannelCount: [1, 1, 1, 1, 1, 1],
      channelCount: 1,
      channelCountMode: 'explicit',
      parameterData: { slewMsPerV: toMs(slew[0]) },
    })
    nodeRef.current = node

    inRef.current.connect(node, 0, 0)
    gateRef.current.connect(node, 0, 1)
    slewCvRef.current.connect(node, 0, 2)

    const mkOut = () => {
      const g = ac.createGain()
      g.gain.value = 1
      return g
    }
    sh1Ref.current = mkOut()
    sh2Ref.current = mkOut()
    thRef.current = mkOut()
    htRef.current = mkOut()
    slewOutRef.current = mkOut()
    glideRef.current = mkOut()

    node.connect(sh1Ref.current, 0, 0)
    node.connect(sh2Ref.current, 1, 0)
    node.connect(thRef.current, 2, 0)
    node.connect(htRef.current, 3, 0)
    node.connect(slewOutRef.current, 4, 0)
    node.connect(glideRef.current, 5, 0)

    // keep alive so processor stays running when unpatched
    keepAliveRef.current = ac.createGain()
    keepAliveRef.current.gain.value = 0
    ;(slewOutRef.current as GainNode).connect(keepAliveRef.current)
    keepAliveRef.current.connect(ac.destination)
  }, 'Process')

  useEffect(() => {
    const ac = acRef.current
    const node = nodeRef.current
    if (!ac || !node) return
    node.parameters
      .get('slewMsPerV')
      ?.setTargetAtTime(toMs(slew[0]), ac.currentTime, 0.01)
  }, [slew])

  return (
    <ModuleContainer moduleId={moduleId} title="Process">
      <div className="flex flex-col items-center justify-between gap-3 mt-4 flex-1">
        <div className="flex flex-col items-center justify-center gap-6 flex-1">
          <Knob value={slew} onValueChange={setSlew} label="Slew" size="md" />

          <div className="flex flex-col items-center gap-1">
            <Port
              id={`${moduleId}-slew-cv-in`}
              type="input"
              label="SLEW"
              audioType="cv"
              audioNode={slewCvRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-in`}
              type="input"
              label="IN"
              audioType="cv"
              audioNode={inRef.current ?? undefined}
            />

            <Port
              id={`${moduleId}-gate-in`}
              type="input"
              label="GATE"
              audioType="gate"
              audioNode={gateRef.current ?? undefined}
            />
          </div>
        </div>

        <PortGroup>
          <div className="flex flex-col items-center gap-1">
            <Port
              id={`${moduleId}-sh1-out`}
              type="output"
              label="S&H1"
              audioType="cv"
              audioNode={sh1Ref.current ?? undefined}
            />
            <Port
              id={`${moduleId}-th-out`}
              type="output"
              label="T&H"
              audioType="cv"
              audioNode={thRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-slew-out`}
              type="output"
              label="SLEW"
              audioType="cv"
              audioNode={slewOutRef.current ?? undefined}
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <Port
              id={`${moduleId}-sh2-out`}
              type="output"
              label="S&H2"
              audioType="cv"
              audioNode={sh2Ref.current ?? undefined}
            />
            <Port
              id={`${moduleId}-ht-out`}
              type="output"
              label="H&T"
              audioType="cv"
              audioNode={htRef.current ?? undefined}
            />
            <Port
              id={`${moduleId}-glide-out`}
              type="output"
              label="GLIDE"
              audioType="cv"
              audioNode={glideRef.current ?? undefined}
            />
          </div>
        </PortGroup>
      </div>
    </ModuleContainer>
  )
}
