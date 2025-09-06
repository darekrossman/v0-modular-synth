import type React from 'react'
import { manuals } from '@/components/manuals'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ModuleType } from '@/lib/module-registry'

export function InfoSheet({
  open,
  onOpenChange,
  moduleName,
  moduleType,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  moduleName: string
  moduleType?: ModuleType
  children?: React.ReactNode
}) {
  const Manual = moduleType ? manuals[moduleType] : undefined
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>User Manual</SheetTitle>
          <SheetDescription>{moduleName}</SheetDescription>
        </SheetHeader>
        <div className="p-6 pt-0">
          {Manual ? (
            <Manual />
          ) : (
            <div className="text-sm text-muted-foreground">
              {children ?? (
                <div>
                  Documentation for{' '}
                  <span className="font-medium">{moduleName}</span> will appear
                  here.
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default InfoSheet
