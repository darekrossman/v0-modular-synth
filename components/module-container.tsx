import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ModuleContainerProps {
  moduleId: string
  title: string
  children: ReactNode
  className?: string
}

export function ModuleContainer({ moduleId, title, children, className = "" }: ModuleContainerProps) {
  return (
    <div className="h-full bg-neutral-300 overflow-hidden" data-module-id={moduleId}>
      <Card className={cn("h-full flex flex-col bg-transparent", className)}>
        <CardHeader className="shrink-0">
          <CardTitle className="text-sm text-black font-extrabold uppercase tracking-wide">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-4 pt-1">{children}</CardContent>
      </Card>
    </div>
  )
}
