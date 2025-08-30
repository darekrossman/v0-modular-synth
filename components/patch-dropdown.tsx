"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { usePatchManager, type Patch } from "./patch-manager"
import { ChevronDown, Save, FolderOpen, Download, Upload, Copy, Trash2, Plus, RotateCcw } from "lucide-react"

export function PatchDropdown() {
  const {
    currentPatch,
    availablePatches,
    savePatch,
    updateCurrentPatch,
    loadPatch,
    exportPatch,
    importPatch,
    deletePatch,
    createNewPatch,
    duplicatePatch,
    loadDefaultPatch,
  } = usePatchManager()

  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [saveAsDialogOpen, setSaveAsDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)

  const [patchName, setPatchName] = useState("")
  const [patchDescription, setPatchDescription] = useState("")
  const [importJson, setImportJson] = useState("")
  const [exportJson, setExportJson] = useState("")
  const [duplicateName, setDuplicateName] = useState("")
  const [selectedPatchForDuplicate, setSelectedPatchForDuplicate] = useState<Patch | null>(null)

  const handleSaveAs = () => {
    if (patchName.trim()) {
      savePatch(patchName.trim(), patchDescription.trim() || undefined)
      setPatchName("")
      setPatchDescription("")
      setSaveAsDialogOpen(false)
    }
  }

  const handleSave = () => {
    updateCurrentPatch()
    setSaveDialogOpen(false)
  }

  const handleImport = () => {
    if (importJson.trim()) {
      const patch = importPatch(importJson.trim())
      if (patch) {
        loadPatch(patch)
        setImportJson("")
        setImportDialogOpen(false)
      }
    }
  }

  const handleExport = (patch: Patch) => {
    const json = exportPatch(patch)
    setExportJson(json)
    setExportDialogOpen(true)
  }

  const handleDuplicate = () => {
    if (selectedPatchForDuplicate && duplicateName.trim()) {
      duplicatePatch(selectedPatchForDuplicate, duplicateName.trim())
      setDuplicateName("")
      setSelectedPatchForDuplicate(null)
      setDuplicateDialogOpen(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="min-w-32">
            <span className="truncate">{currentPatch?.name || "No Patch"}</span>
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Patch Management</DropdownMenuLabel>

          <DropdownMenuItem onClick={createNewPatch}>
            <Plus className="w-4 h-4 mr-2" />
            New Patch
          </DropdownMenuItem>

          <DropdownMenuItem onClick={loadDefaultPatch}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Load Default Patch
          </DropdownMenuItem>

          {currentPatch && (
            <DropdownMenuItem onClick={() => setSaveDialogOpen(true)}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => setSaveAsDialogOpen(true)}>
            <Save className="w-4 h-4 mr-2" />
            Save As...
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Import Patch
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {availablePatches.length > 0 && (
            <>
              <DropdownMenuLabel>Available Patches</DropdownMenuLabel>
              {availablePatches.map((patch) => (
                <div key={patch.name} className="flex items-center">
                  <DropdownMenuItem className="flex-1" onClick={() => loadPatch(patch)}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    <span className="truncate">{patch.name}</span>
                    {patch.name === "Default Patch" && (
                      <span className="ml-2 text-xs text-muted-foreground">(Default)</span>
                    )}
                  </DropdownMenuItem>
                  <div className="flex gap-1 px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-6 h-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExport(patch)
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-6 h-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedPatchForDuplicate(patch)
                        setDuplicateName(`${patch.name} Copy`)
                        setDuplicateDialogOpen(true)
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    {patch.name !== "Default Patch" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-6 h-6 p-0 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          deletePatch(patch.name)
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save Patch Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Patch</DialogTitle>
            <DialogDescription>
              Update "{currentPatch?.name}" with the current synthesizer configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              This will overwrite the existing patch "{currentPatch?.name}" with your current settings.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Patch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save As Patch Dialog */}
      <Dialog open={saveAsDialogOpen} onOpenChange={setSaveAsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save As New Patch</DialogTitle>
            <DialogDescription>Save the current synthesizer configuration as a new patch.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="patch-name">Patch Name</Label>
              <Input
                id="patch-name"
                value={patchName}
                onChange={(e) => setPatchName(e.target.value)}
                placeholder="Enter patch name..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patch-description">Description (Optional)</Label>
              <Textarea
                id="patch-description"
                value={patchDescription}
                onChange={(e) => setPatchDescription(e.target.value)}
                placeholder="Describe this patch..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveAsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAs} disabled={!patchName.trim()}>
              Save As New Patch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Patch Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Patch</DialogTitle>
            <DialogDescription>Paste a patch JSON to import it into the synthesizer.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="import-json">Patch JSON</Label>
              <Textarea
                id="import-json"
                value={importJson}
                onChange={(e) => setImportJson(e.target.value)}
                placeholder="Paste patch JSON here..."
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={!importJson.trim()}>
              Import Patch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Patch Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export Patch</DialogTitle>
            <DialogDescription>Copy this JSON to share or backup your patch.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="export-json">Patch JSON</Label>
              <Textarea id="export-json" value={exportJson} readOnly rows={10} className="font-mono text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Close
            </Button>
            <Button onClick={() => copyToClipboard(exportJson)}>Copy to Clipboard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Patch Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate Patch</DialogTitle>
            <DialogDescription>Create a copy of "{selectedPatchForDuplicate?.name}" with a new name.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="duplicate-name">New Patch Name</Label>
              <Input
                id="duplicate-name"
                value={duplicateName}
                onChange={(e) => setDuplicateName(e.target.value)}
                placeholder="Enter new patch name..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDuplicate} disabled={!duplicateName.trim()}>
              Duplicate Patch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
