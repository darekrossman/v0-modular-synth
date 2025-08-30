"use client"

import { useSettings } from "@/components/settings-context"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

export function SettingsDialog() {
  const { isOpen, close, settings, setSettings } = useSettings()

  return (
    <Dialog open={isOpen} onOpenChange={(o) => (!o ? close() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage application settings. (Coming soon)</DialogDescription>
        </DialogHeader>

        <div className="py-2 text-sm text-muted-foreground space-y-4">
          <div>
            <div className="text-foreground font-medium mb-2">Cables</div>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground w-28">Cable Droop</div>
              <div className="flex-1">
                <Slider
                  value={[typeof settings.wireDroop === 'number' ? settings.wireDroop : 0.5]}
                  onValueChange={(v) => setSettings((prev) => ({ ...prev, wireDroop: Math.max(0, Math.min(1, v[0] ?? 0)) }))}
                  min={0}
                  max={1}
                  step={0.01}
                />
              </div>
              <div className="w-10 text-right text-xs tabular-nums">{Math.round(((settings.wireDroop as number ?? 0.5) * 100))}%</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={close}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
