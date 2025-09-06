'use client'

import { Book, X } from 'lucide-react'
import type React from 'react'
import { memo, useMemo, useState } from 'react'
import InfoSheet from '@/components/info-sheet'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  availableModules,
  type ModuleCatalogEntry,
  type ModuleInstance,
} from '@/lib/module-registry'

export const DraggableModuleItem = memo(
  ({
    module,
    index,
    rackModules,
    onDelete,
    onDragStart,
    isDragging,
    draggedId,
  }: {
    module: ModuleInstance
    index: number
    rackModules: ModuleInstance[]
    onDelete: (moduleId: string) => void
    onDragStart: (
      e: React.DragEvent,
      module: ModuleInstance,
      index: number,
    ) => void
    isDragging: boolean
    draggedId: string | undefined
  }) => {
    const opacity = isDragging && draggedId === module.id ? 0.3 : 1

    const [isDraggable, setIsDraggable] = useState(false)
    const [infoOpen, setInfoOpen] = useState(false)

    const moduleName = useMemo(() => {
      const entry: ModuleCatalogEntry | undefined = availableModules.find(
        (m) => m.type === module.type,
      )
      return entry?.name ?? module.type
    }, [module.type])

    return (
      <div
        key={module.id}
        className="relative h-full"
        style={{
          marginRight: index < rackModules.length - 1 ? '2px' : 0,
          opacity,
        }}
        draggable={isDraggable}
        onDragStart={(e) => {
          if (isDraggable) {
            onDragStart(e, module, index)
          }
        }}
        onMouseDown={(e) => {
          const target = e.target as HTMLElement
          const header = target.closest('.module-header')
          setIsDraggable(!!header)
        }}
        onMouseUp={() => {
          setIsDraggable(false)
        }}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="h-full">
              {(() => {
                const entry: ModuleCatalogEntry | undefined =
                  availableModules.find((m) => m.type === module.type)
                if (!entry) return null
                const Component = entry.component
                return <Component moduleId={module.id} />
              })()}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => setInfoOpen(true)}>
              <Book className="w-3 h-3" />
              user uanual
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onDelete(module.id)}
              className="flex items-center gap-2"
            >
              <X className="w-3 h-3" />
              remove
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <InfoSheet
          open={infoOpen}
          onOpenChange={setInfoOpen}
          moduleName={moduleName}
          moduleType={module.type}
        />
      </div>
    )
  },
)

DraggableModuleItem.displayName = 'DraggableModuleItem'

export const DragIndicator = () => (
  <div className="relative h-full flex-shrink-0">
    <div className="absolute top-0 left-[-2px] w-[4px] h-full bg-red-500 flex-shrink-0 z-10" />
  </div>
)
