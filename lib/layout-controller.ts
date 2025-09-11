export type LayoutModuleEntry = {
  id: string
  el: HTMLElement
  x: number
  w: number
}

export class RackLayoutController {
  private modules: LayoutModuleEntry[] = []
  private rafId: number | null = null
  private pendingWrite = false

  private dragging: {
    id: string
    rack: number
    baseX: number
    baseY: number
    w: number
    pointerOffsetX: number
    pointerOffsetY: number
  } | null = null

  private displaced = new Map<string, number>() // id -> deltaX
  private initialX = new Map<string, number>()
  private currentX = new Map<string, number>()
  private order: string[] = []

  constructor(
    private getScale: () => number,
    private getViewportRect: () => DOMRect | null,
    private getRackRect: (rackIndex: number) => DOMRect | null,
    private onScheduleGeometryRefresh?: () => void,
  ) {}

  registerModule(rack: number, id: string, el: HTMLElement, baseX: number) {
    const w = el.getBoundingClientRect().width / this.getScale()
    const idx = this.modules.findIndex((m) => m.id === id)
    const entry = { id, el, x: baseX ?? 0, w }
    if (idx >= 0) this.modules[idx] = entry
    else this.modules.push(entry)
  }

  unregisterModule(id: string) {
    this.modules = this.modules.filter((m) => m.id !== id)
    this.displaced.delete(id)
  }

  measure(id: string) {
    const m = this.modules.find((m) => m.id === id)
    if (!m) return 0
    const w = m.el.getBoundingClientRect().width / this.getScale()
    m.w = w
    return w
  }

  startDrag(moduleId: string, rack: number, clientX: number, clientY: number) {
    const m = this.modules.find((m) => m.id === moduleId)
    if (!m) return
    const scale = this.getScale()
    const rackRect = this.getRackRect(rack)
    if (!rackRect) return
    const pointerXInRack = (clientX - rackRect.left) / scale
    const pointerYInRack = (clientY - rackRect.top) / scale
    this.dragging = {
      id: moduleId,
      rack,
      baseX: m.x,
      baseY: 0,
      w: m.w,
      pointerOffsetX: pointerXInRack - m.x,
      pointerOffsetY: pointerYInRack - 0,
    }
    // Snapshot x/order for collision-based reordering
    this.initialX.clear()
    this.currentX.clear()
    this.order = this.modules
      .slice()
      .sort((a, b) => a.x - b.x)
      .map((mm) => mm.id)
    for (const mm of this.modules) {
      this.initialX.set(mm.id, mm.x)
      this.currentX.set(mm.id, mm.x)
    }

    m.el.style.willChange = 'transform'
    m.el.style.zIndex = '50'
    this.schedule()
  }

  private findIndex(id: string) {
    return this.order.findIndex((x) => x === id)
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

  updateDrag(clientX: number, clientY: number) {
    if (!this.dragging) return
    const { rack, pointerOffsetX, id: dragId, w: dragW } = this.dragging
    const scale = this.getScale()
    const rackRect = this.getRackRect(rack)
    if (!rackRect) return
    const xInRack = (clientX - rackRect.left) / scale
    let desiredLeft = xInRack - pointerOffsetX
    if (!Number.isFinite(desiredLeft)) desiredLeft = 0

    // Position constrained by immediate neighbors
    let idx = this.findIndex(dragId)
    if (idx === -1) {
      this.order = this.modules
        .slice()
        .sort((a, b) => a.x - b.x)
        .map((mm) => mm.id)
      idx = this.findIndex(dragId)
      if (idx === -1) return
    }
    const leftId = this.order[idx - 1]
    const rightId = this.order[idx + 1]
    const GAP = 8
    const leftW = leftId
      ? (this.modules.find((m) => m.id === leftId)?.w ?? 0)
      : 0
    const rightW = rightId
      ? (this.modules.find((m) => m.id === rightId)?.w ?? 0)
      : 0
    const leftBound = leftId
      ? (this.currentX.get(leftId) ?? 0) + leftW + GAP
      : 0
    const rightBound = rightId
      ? (this.currentX.get(rightId) ?? 0) - dragW - GAP
      : Number.POSITIVE_INFINITY
    const clampedLeft = Math.max(leftBound, Math.min(rightBound, desiredLeft))

    // Bubble-swap when crossing neighbor centers
    const dragCenter = clampedLeft + dragW / 2
    if (rightId) {
      const rightCenter = (this.currentX.get(rightId) ?? 0) + rightW / 2
      if (dragCenter > rightCenter) idx = this.swapWithNeighbor(idx, +1)
    }
    if (leftId) {
      const leftCenter = (this.currentX.get(leftId) ?? 0) + leftW / 2
      if (dragCenter < leftCenter) idx = this.swapWithNeighbor(idx, -1)
    }

    this.currentX.set(dragId, clampedLeft)

    const disp = new Map<string, number>()
    for (const mm of this.modules) {
      const x0 = this.initialX.get(mm.id) ?? mm.x
      const x1 = this.currentX.get(mm.id) ?? mm.x
      disp.set(mm.id, x1 - x0)
    }
    this.displaced = disp
    this.onScheduleGeometryRefresh?.()
    this.schedule()
  }

  endDrag(): {
    rack: number
    id: string
    x: number
    updates: Array<{ id: string; x: number }>
  } | null {
    if (!this.dragging) return null
    const d = this.dragging
    const draggedModule = this.modules.find((m) => m.id === d.id)
    if (!draggedModule) return null

    const finalDx = this.displaced.get(d.id) ?? 0
    const finalX = Math.max(0, d.baseX + finalDx)

    // Commit base x for all displaced
    const updates: Array<{ id: string; x: number }> = []
    for (const m of this.modules) {
      const dx = this.displaced.get(m.id) ?? 0
      if (dx !== 0) {
        m.x = m.x + dx
        updates.push({ id: m.id, x: m.x })
      }
      m.el.style.transform = ''
      m.el.style.willChange = ''
      m.el.style.zIndex = ''
    }

    // Ensure dragged present in updates
    const idx = updates.findIndex((u) => u.id === d.id)
    if (idx >= 0) updates[idx].x = finalX
    else updates.push({ id: d.id, x: finalX })

    this.dragging = null
    this.displaced.clear()
    return { rack: d.rack, id: d.id, x: finalX, updates }
  }

  private schedule() {
    if (this.pendingWrite) return
    this.pendingWrite = true
    this.rafId = requestAnimationFrame(() => this.apply())
  }

  private apply() {
    this.pendingWrite = false
    // Apply transforms for displaced modules
    for (const m of this.modules) {
      const dx = this.displaced.get(m.id) ?? 0
      if (dx !== 0) {
        m.el.style.transform = `translate3d(${dx}px, 0, 0)`
      } else {
        if (this.dragging?.id !== m.id) m.el.style.transform = ''
      }
    }
    // Dragged gets same dx transform (others already handled)
    if (this.dragging) {
      const dx = this.displaced.get(this.dragging.id) ?? 0
      const dragged = this.modules.find((m) => m.id === this.dragging?.id)
      if (dragged) dragged.el.style.transform = `translate3d(${dx}px, 0, 0)`
    }
  }
}
