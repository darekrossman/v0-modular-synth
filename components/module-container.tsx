import { GripVertical } from 'lucide-react'
import type { ReactNode } from 'react'
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
      className="h-full bg-gradient-to-t from-module-background/85 to-module-background overflow-hidden"
      data-module-id={moduleId}
    >
      <Card className={cn('h-full flex flex-col bg-transparent', className)}>
        <CardHeader className="shrink-0 relative group cursor-grab active:cursor-grabbing module-header">
          <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity">
            <GripVertical className="w-4 h-4" />
          </div>
          <CardTitle className="text-sm text-black font-extrabold lowercase font-mono tracking-wide">
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
