'use client'

import React, { useState } from 'react'
import { ConnectionProvider } from '@/components/connection-manager'
import { PatchProvider } from '@/components/patch-manager'
import { Racks } from '@/components/rack/racks'
import { SettingsProvider } from '@/components/settings-context'
import { SettingsDialog } from '@/components/settings-dialog'
import type { ModuleInstance, ModuleType } from '@/lib/module-registry'

export default function RacksContainer() {
  const [modules, setModules] = useState<ModuleInstance[]>([])

  const addModule = (type: ModuleType) => {
    const existingCount = modules.filter((m) => m.type === type).length
    const newId = `${type}-${existingCount + 1}`
    const rack =
      type === 'sequencer' || type === 'quantizer' || type === 'euclid' ? 3 : 1
    setModules((prev) => [...prev, { id: newId, type, rack }])
  }

  const removeModule = (moduleId: string) => {
    setModules((prev) => prev.filter((m) => m.id !== moduleId))
  }

  const handleParameterChange = (
    moduleId: string,
    parameter: string,
    value: any,
  ) => {
    const moduleElement = document.querySelector(
      `[data-module-id="${moduleId}"]`,
    )
    if (moduleElement && (moduleElement as any).setParameters) {
      ;(moduleElement as any).setParameters({ [parameter]: value })
    }
  }

  return (
    <SettingsProvider>
      <ConnectionProvider>
        <PatchProvider
          modules={modules}
          onModulesChange={(
            m: Array<{ id: string; type: string; rack?: number }>,
          ) =>
            setModules(
              m.map((x) => ({
                id: x.id,
                type: x.type as ModuleType,
                rack:
                  x.rack !== undefined
                    ? x.rack
                    : x.type === 'sequencer' ||
                        x.type === 'quantizer' ||
                        x.type === 'euclid'
                      ? 3
                      : 1,
              })),
            )
          }
          onParameterChange={handleParameterChange}
        >
          <Racks
            modules={modules}
            setModules={setModules}
            addModule={addModule}
            removeModule={removeModule}
          />
          <SettingsDialog />
        </PatchProvider>
      </ConnectionProvider>
    </SettingsProvider>
  )
}
