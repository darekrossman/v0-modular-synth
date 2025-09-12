'use client'

import React, { useState } from 'react'
import { ConnectionProvider } from '@/components/connection-manager'
import { PatchProvider } from '@/components/patch-manager'
import { Racks } from '@/components/rack/racks'
import { SettingsProvider } from '@/components/settings-context'
import { SettingsDialog } from '@/components/settings-dialog'
import type { ModuleInstance, ModuleType } from '@/lib/module-registry'
import { availableModules } from '@/lib/module-registry'

export default function RacksContainer() {
  const [modules, setModules] = useState<ModuleInstance[]>([])

  const addModule = (type: ModuleType) => {
    const existingCount = modules.filter((m) => m.type === type).length
    const newId = `${type}-${existingCount + 1}`
    const rack = 1
    // Place new module at the first free HP slot in the target rack
    const HP_PX = 20
    const getModuleHp = (t: ModuleType) =>
      availableModules.find((m) => m.type === t)?.hp ?? 9
    const rackModules = modules
      .filter((m) => (m.rack ?? 1) === rack)
      .map((m) => ({
        xHp: m.xHp ?? Math.round((m.x ?? 0) / HP_PX),
        hp: m.hp ?? getModuleHp(m.type as ModuleType),
      }))
      .sort((a, b) => (a.xHp ?? 0) - (b.xHp ?? 0))
    const widthHp = getModuleHp(type)
    let cursor = 0
    for (const { xHp, hp } of rackModules) {
      if (cursor + widthHp <= (xHp ?? 0)) break
      cursor = Math.max(cursor, (xHp ?? 0) + (hp ?? 0))
    }
    setModules((prev) => [
      ...prev,
      { id: newId, type, rack, xHp: cursor, hp: widthHp },
    ])
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
            m: Array<{
              id: string
              type: string
              rack?: number
              x?: number
              xHp?: number
              hp?: number
            }>,
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
                ...(x.x !== undefined && { x: x.x }),
                ...(x.xHp !== undefined && { xHp: x.xHp }),
                ...(x.hp !== undefined && { hp: x.hp }),
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
