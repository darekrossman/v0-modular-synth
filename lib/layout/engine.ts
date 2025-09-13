import type { PackItem } from './pack'
import { GAP_PX, HP_PX, packWithout, packWithVirtual, toHp, toPx } from './pack'

export type ModuleSize = { w: number; h: number }
export type ModulePosition = { x: number; y: number; rack: number }

export type EngineConfig = {
  getScale: () => number
  getViewportRect: () => DOMRect | null
  getWorldRect: () => DOMRect | null
  getRackRect: (rackIndex: number) => DOMRect | null
  rowHeightPx: number
  numRows: number
  onScheduleWireRefresh?: () => void
}

export type ModuleEntry = {
  id: string
  el: HTMLElement
  size: ModuleSize
  // base position in px
  x: number
  y: number
  rack: number
}

export class LayoutEngine {
  private modules = new Map<string, ModuleEntry>()
  private byRack = new Map<number, string[]>()
  private displaced = new Map<string, { dx: number; dy: number }>()
  private initialX = new Map<string, number>()
  private currentX = new Map<string, number>()
  private order: string[] = []
  private pendingWrite = false
  private dragging: null | {
    id: string
    pointerId: number
    pointerOffsetX: number
    pointerOffsetY: number
    startClientX: number
    startClientY: number
    startRack: number
    startX: number
    startY: number
    w: number
    h: number
  }

  constructor(private cfg: EngineConfig) {
    this.dragging = null
  }

  registerModule(
    id: string,
    el: HTMLElement,
    size: ModuleSize,
    initial: { xHp?: number; rack?: number; x?: number; y?: number },
  ) {
    const x = initial.xHp !== undefined ? toPx(initial.xHp) : (initial.x ?? 0)
    const rack = initial.rack ?? 1
    const y = (rack - 1) * this.cfg.rowHeightPx
    const entry: ModuleEntry = { id, el, size, x, y, rack }
    this.modules.set(id, entry)
    const list = this.byRack.get(rack) ?? []
    if (!list.includes(id)) list.push(id)
    this.byRack.set(rack, list)
    // apply base transform
    entry.el.style.position = 'absolute'
    entry.el.style.top = '0px' // anchored by container; we translate for Y
    this.applyBaseTransform(entry)
  }

  unregisterModule(id: string) {
    const entry = this.modules.get(id)
    if (!entry) return
    this.modules.delete(id)
    const list = this.byRack.get(entry.rack)
    if (list)
      this.byRack.set(
        entry.rack,
        list.filter((x) => x !== id),
      )
  }

  private applyBaseTransform(m: ModuleEntry) {
    m.el.style.transform = `translate3d(${m.x}px, ${m.y}px, 0)`
    m.el.style.width = `${m.size.w}px`
    m.el.style.height = `${this.cfg.rowHeightPx}px`
  }

  private schedule() {
    if (this.pendingWrite) return
    this.pendingWrite = true
    requestAnimationFrame(() => this.apply())
  }

  private apply() {
    this.pendingWrite = false
    for (const [id, disp] of this.displaced) {
      const m = this.modules.get(id)
      if (!m) continue
      const tx = m.x + (disp?.dx ?? 0)
      const ty = m.y + (disp?.dy ?? 0)
      m.el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`
    }
    if (this.cfg.onScheduleWireRefresh) this.cfg.onScheduleWireRefresh()
  }

  private swapWithNeighbor(dragIndex: number, dir: 1 | -1) {
    const neighborIndex = dragIndex + dir
    if (neighborIndex < 0 || neighborIndex >= this.order.length)
      return dragIndex
    const dragId = this.order[dragIndex]
    const neighId = this.order[neighborIndex]
    const dragX = this.currentX.get(dragId) ?? 0
    const neighX = this.currentX.get(neighId) ?? 0
    this.currentX.set(dragId, neighX)
    this.currentX.set(neighId, dragX)
    ;[this.order[dragIndex], this.order[neighborIndex]] = [
      this.order[neighborIndex],
      this.order[dragIndex],
    ]
    return neighborIndex
  }

  beginDrag(
    moduleId: string,
    pointerId: number,
    clientX: number,
    clientY: number,
  ) {
    const m = this.modules.get(moduleId)
    if (!m) return
    const rackRect = this.cfg.getRackRect(m.rack)
    const scale = this.cfg.getScale()
    if (!rackRect || scale <= 0) return
    const pointerXInRack = (clientX - rackRect.left) / scale
    const pointerYInRack = (clientY - rackRect.top) / scale
    this.dragging = {
      id: m.id,
      pointerId,
      pointerOffsetX: pointerXInRack - m.x,
      pointerOffsetY: pointerYInRack - 0,
      startClientX: clientX,
      startClientY: clientY,
      startRack: m.rack,
      startX: m.x,
      startY: m.y,
      w: m.size.w,
      h: m.size.h,
    }
    // snapshot
    this.initialX.clear()
    this.currentX.clear()
    this.order = (this.byRack.get(m.rack) ?? [])
      .slice()
      .sort(
        (a, b) => (this.modules.get(a)?.x ?? 0) - (this.modules.get(b)?.x ?? 0),
      )
    for (const id of this.order) {
      const mx = this.modules.get(id)?.x ?? 0
      this.initialX.set(id, mx)
      this.currentX.set(id, mx)
    }
    m.el.style.willChange = 'transform'
    m.el.style.zIndex = '50'
    m.el.style.filter = 'drop-shadow(2px 4px 6px black)'
  }

  updateDrag(clientX: number, clientY: number) {
    if (!this.dragging) return
    const d = this.dragging
    const scale = this.cfg.getScale()
    const rowHeight = this.cfg.rowHeightPx
    const numRows = this.cfg.numRows
    // Determine target rack by pointer Y in world space
    const viewport = this.cfg.getViewportRect()
    const world = this.cfg.getWorldRect()
    if (!viewport || !world) return
    const worldOffsetX = world.left - viewport.left
    const worldOffsetY = world.top - viewport.top
    const xInWorld = (clientX - viewport.left - worldOffsetX) / scale
    const yInWorld = (clientY - viewport.top - worldOffsetY) / scale
    let targetRack = Math.floor(yInWorld / rowHeight) + 1
    if (targetRack < 1) targetRack = 1
    if (targetRack > numRows) targetRack = numRows

    // Calculate desired left in target rack
    const rackRect = this.cfg.getRackRect(targetRack)
    if (!rackRect) return
    const xInRack = (clientX - rackRect.left) / scale
    let desiredLeftRaw = xInRack - d.pointerOffsetX
    if (!Number.isFinite(desiredLeftRaw)) desiredLeftRaw = 0

    const rowWidth = rackRect.width / scale
    const maxX = Math.max(0, rowWidth - d.w)
    let desiredLeft = Math.max(0, Math.min(maxX, desiredLeftRaw))
    // Snap to HP grid
    desiredLeft = Math.floor((desiredLeft + HP_PX / 2) / HP_PX) * HP_PX

    const draggedId = d.id
    const sourceRack = this.modules.get(draggedId)?.rack ?? d.startRack

    // Same-rack: reorder by center crossing, do not push neighbors
    if (targetRack === sourceRack) {
      // Ensure order and index
      let idx = this.order.findIndex((x) => x === draggedId)
      if (idx === -1) {
        this.order = (this.byRack.get(sourceRack) ?? [])
          .slice()
          .sort(
            (a, b) =>
              (this.modules.get(a)?.x ?? 0) - (this.modules.get(b)?.x ?? 0),
          )
        idx = this.order.findIndex((x) => x === draggedId)
        if (idx === -1) return
      }

      const trySwap = () => {
        let swapped = false
        const leftId = this.order[idx - 1]
        const rightId = this.order[idx + 1]
        const leftW = leftId ? (this.modules.get(leftId)?.size.w ?? 0) : 0
        const rightW = rightId ? (this.modules.get(rightId)?.size.w ?? 0) : 0
        const desiredCenter = desiredLeftRaw + d.w / 2
        if (rightId) {
          const rightCenter =
            (this.currentX.get(rightId) ?? this.modules.get(rightId)?.x ?? 0) +
            rightW / 2
          if (desiredCenter >= rightCenter) {
            idx = this.swapWithNeighbor(idx, +1)
            swapped = true
          }
        }
        if (leftId) {
          const leftCenter =
            (this.currentX.get(leftId) ?? this.modules.get(leftId)?.x ?? 0) +
            leftW / 2
          if (desiredCenter <= leftCenter) {
            idx = this.swapWithNeighbor(idx, -1)
            swapped = true
          }
        }
        return swapped
      }
      while (trySwap()) {}

      // Clamp dragged between immediate neighbors (no gap)
      const leftId2 = this.order[idx - 1]
      const rightId2 = this.order[idx + 1]
      const leftW2 = leftId2 ? (this.modules.get(leftId2)?.size.w ?? 0) : 0
      const leftBound = leftId2
        ? (this.currentX.get(leftId2) ?? this.modules.get(leftId2)?.x ?? 0) +
          leftW2
        : 0
      const rightBound = rightId2
        ? (this.currentX.get(rightId2) ?? this.modules.get(rightId2)?.x ?? 0) -
          d.w
        : maxX
      const clamped = Math.max(leftBound, Math.min(rightBound, desiredLeft))
      let q = Math.floor((clamped + HP_PX / 2) / HP_PX) * HP_PX
      if (q < leftBound) q = Math.ceil(leftBound / HP_PX) * HP_PX
      if (q > rightBound) q = Math.floor(rightBound / HP_PX) * HP_PX
      this.currentX.set(draggedId, q)

      // Only drag the dragged module; neighbors remain visually in place
      this.displaced.clear()
      const m = this.modules.get(draggedId)
      if (m) this.displaced.set(draggedId, { dx: q - m.x, dy: 0 })
      this.schedule()
      return
    }

    // Cross-rack: use packing for source/target racks
    const targetExisting: PackItem[] = (this.byRack.get(targetRack) ?? [])
      .filter((id) => id !== draggedId)
      .map((id) => {
        const mm = this.modules.get(id)
        return { id, x: mm ? mm.x : 0, w: mm ? mm.size.w : 0 }
      })
    const sourceExisting: PackItem[] = (this.byRack.get(sourceRack) ?? [])
      .filter((id) => id !== draggedId)
      .map((id) => {
        const mm = this.modules.get(id)
        return { id, x: mm ? mm.x : 0, w: mm ? mm.size.w : 0 }
      })

    const sourceWidthRect = this.cfg.getRackRect(sourceRack)
    const sourceRowWidth = sourceWidthRect
      ? sourceWidthRect.width / scale
      : rowWidth
    const sourceUpdates = packWithout(sourceExisting, sourceRowWidth)
    const { updates: targetUpdates, draggedX } = packWithVirtual(
      targetExisting,
      { x: desiredLeft, w: d.w },
      rowWidth,
    )

    this.displaced.clear()
    for (const u of sourceUpdates) {
      const m = this.modules.get(u.id)
      if (!m) continue
      this.displaced.set(u.id, { dx: u.x - m.x, dy: 0 })
    }
    for (const u of targetUpdates) {
      const m = this.modules.get(u.id)
      if (!m) continue
      this.displaced.set(u.id, {
        dx: u.x - m.x,
        dy: (targetRack - m.rack) * rowHeight,
      })
    }
    {
      const m = this.modules.get(draggedId)
      if (m) {
        const baseY = m.y
        const targetY = (targetRack - 1) * rowHeight
        this.displaced.set(draggedId, {
          dx: draggedX - m.x,
          dy: targetY - baseY,
        })
      }
    }
    this.schedule()
  }

  endDrag(): {
    id: string
    rack: number
    xHp: number
    updates: Array<{ id: string; rack: number; xHp: number }>
  } | null {
    if (!this.dragging) return null
    const d = this.dragging
    const dragged = this.modules.get(d.id)
    if (!dragged) return null
    // Apply displacements
    const updates: Array<{ id: string; rack: number; xHp: number }> = []
    for (const [id, disp] of this.displaced) {
      const m = this.modules.get(id)
      if (!m) continue
      const newX = Math.max(0, m.x + (disp?.dx ?? 0))
      let newRack = m.rack
      if (Math.abs(disp?.dy ?? 0) >= this.cfg.rowHeightPx / 2 - 1) {
        const newY = m.y + (disp?.dy ?? 0)
        newRack = Math.round(newY / this.cfg.rowHeightPx) + 1
      }
      m.x = newX
      m.rack = newRack
      m.y = (newRack - 1) * this.cfg.rowHeightPx
      updates.push({ id, rack: newRack, xHp: toHp(newX) })
      this.applyBaseTransform(m)
    }
    // Ensure dragged present
    if (!updates.find((u) => u.id === d.id)) {
      updates.push({ id: d.id, rack: dragged.rack, xHp: toHp(dragged.x) })
    }
    // Clear drag state and styles
    const dragEl = dragged.el
    dragEl.style.willChange = ''
    dragEl.style.zIndex = ''
    dragEl.style.filter = ''
    this.displaced.clear()
    this.dragging = null
    return { id: dragged.id, rack: dragged.rack, xHp: toHp(dragged.x), updates }
  }
}
