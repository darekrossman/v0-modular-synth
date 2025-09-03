import { Plus, Settings as SettingsIcon } from 'lucide-react'
import { PatchDropdown } from '@/components/patch-dropdown'
import { usePatchManager } from '@/components/patch-manager'
import { useSettings } from '@/components/settings-context'
import { Button } from '@/components/ui/button'

export function Header({
  openAddModuleDialog,
}: {
  openAddModuleDialog: () => void
}) {
  const { currentPatch } = usePatchManager()
  const { open } = useSettings()

  return (
    <header className="px-6 py-2 border-b border-border flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">vrack</h1>
        <p className="text-sm text-muted-foreground">
          {currentPatch?.name || 'empty patch'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="" onClick={openAddModuleDialog}>
          <Plus className="w-3 h-3" />
          Module
        </Button>

        <PatchDropdown />

        <Button size="sm" onClick={open}>
          <SettingsIcon className="w-3 h-3" />
          Settings
        </Button>
      </div>
    </header>
  )
}
