import { GripVertical } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ModuleContainerProps {
  moduleId: string
  title: string
  children: ReactNode
  className?: string
}

export function ModuleContainer({
  moduleId,
  title,
  children,
  className = '',
}: ModuleContainerProps) {
  return (
    <div
      className="h-full bg-gradient-to-b from-module-background-gradient to-module-background overflow-hidden text-module-foreground"
      data-module-id={moduleId}
    >
      <Card
        className={cn(
          'relative h-full flex flex-col bg-transparent pt-2 pb-2',
          className,
        )}
      >
        <Screw position="top" side="left" />
        <Screw position="top" side="right" />
        <Screw position="bottom" side="left" />
        <Screw position="bottom" side="right" />
        <CardHeader className="shrink-0 relative group cursor-grab active:cursor-grabbing module-header">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
            <GripVertical className="w-4 h-4" />
          </div>
          <CardTitle className="text-sm font-extrabold lowercase font-mono tracking-wide">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-3 pt-0">
          {children}
        </CardContent>
      </Card>
    </div>
  )
}

const Screw = ({
  position,
  side,
}: {
  position: 'top' | 'bottom'
  side: 'left' | 'right'
}) => {
  const rotation = useMemo(() => {
    return Math.floor(Math.random() * 360)
  }, [])
  return (
    <div
      className={`absolute size-2.5 rounded-full bg-black/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),0_1px_0_0_rgba(0,0,0,0.2)]`}
      style={{
        [position]: '5px',
        [side]: '5px',
      }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1px] h-[5px] bg-white/15"
        style={{
          transform: `rotate(${rotation}deg)`,
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[5px] h-[1px] bg-white/15"
        style={{
          transform: `rotate(${rotation}deg)`,
        }}
      />
    </div>
  )
}
