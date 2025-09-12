export type LayoutModuleEntry = {
  id: string
  el: HTMLElement
  x: number
  w: number
  xHp?: number
  hp?: number
}

export class RackLayoutController {
  private modules: LayoutModuleEntry[] = []
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
    // Visual affordance for dragged module
    m.el.style.filter = 'drop-shadow(2px 4px 6px black)'
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
    const desiredLeftRaw = xInRack - pointerOffsetX
    let desiredLeft = desiredLeftRaw
    if (!Number.isFinite(desiredLeft)) desiredLeft = 0

    // Clamp within rack width first
    const rowWidth = rackRect.width / scale
    const minX = 0
    const maxX = Math.max(0, rowWidth - dragW)
    desiredLeft = Math.max(minX, Math.min(maxX, desiredLeft))

    // Ensure we have order and index
    let idx = this.findIndex(dragId)
    if (idx === -1) {
      this.order = this.modules
        .slice()
        .sort((a, b) => a.x - b.x)
        .map((mm) => mm.id)
      idx = this.findIndex(dragId)
      if (idx === -1) return
    }

    // Allow swapping by comparing desired center vs neighbor centers BEFORE clamping to neighbor bounds
    const trySwapAcrossNeighbors = () => {
      let swapped = false
      const leftId = this.order[idx - 1]
      const rightId = this.order[idx + 1]
      const leftW = leftId
        ? (this.modules.find((m) => m.id === leftId)?.w ?? 0)
        : 0
      const rightW = rightId
        ? (this.modules.find((m) => m.id === rightId)?.w ?? 0)
        : 0
      // Use the unclamped desired center for swap checks so we can cross the left-most neighbor
      const desiredCenter = desiredLeftRaw + dragW / 2
      // Tunable threshold so swaps happen slightly before exact center-crossing
      const SWAP_THRESHOLD_PX = 8 // ~0.4 HP at 20px/HP
      // Special-case left-most insertion: if left neighbor sits at x=0 and our unclamped desired left is <= 0,
      // force a swap so we can become the new left-most entry.
      if (leftId) {
        const leftX = this.currentX.get(leftId) ?? 0
        if (leftX <= 0 && desiredLeftRaw <= 0) {
          idx = this.swapWithNeighbor(idx, -1)
          swapped = true
        }
      }
      if (rightId) {
        const rightCenter = (this.currentX.get(rightId) ?? 0) + rightW / 2
        if (desiredCenter >= rightCenter - SWAP_THRESHOLD_PX) {
          idx = this.swapWithNeighbor(idx, +1)
          swapped = true
        }
      }
      if (leftId) {
        const leftCenter = (this.currentX.get(leftId) ?? 0) + leftW / 2
        if (desiredCenter <= leftCenter + SWAP_THRESHOLD_PX) {
          idx = this.swapWithNeighbor(idx, -1)
          swapped = true
        }
      }
      return swapped
    }
    while (trySwapAcrossNeighbors()) {}

    // After swaps, clamp against immediate neighbor bounds (permit hitting 0)
    {
      const leftId2 = this.order[idx - 1]
      const rightId2 = this.order[idx + 1]
      const GAP = 0
      const leftW2 = leftId2
        ? (this.modules.find((m) => m.id === leftId2)?.w ?? 0)
        : 0
      // If there is no left neighbor, permit the dragged module to reach 0
      const leftBound2 = leftId2
        ? (this.currentX.get(leftId2) ?? 0) + leftW2 + GAP
        : 0
      const rightBound2 = rightId2
        ? (this.currentX.get(rightId2) ?? 0) - dragW - GAP
        : maxX
      // Snap to 1HP grid (20px) while staying within neighbor bounds
      const STEP = 20
      // First clamp to neighbor range, then quantize inside it
      const clamped = Math.max(leftBound2, Math.min(rightBound2, desiredLeft))
      // Quantize to nearest step (bias toward lower bound so we can reach x=0)
      let q = Math.floor((clamped + STEP / 2) / STEP) * STEP
      // Ensure quantized value still within bounds by nudging toward range
      if (q < leftBound2) q = Math.ceil(leftBound2 / STEP) * STEP
      if (q > rightBound2) q = Math.floor(rightBound2 / STEP) * STEP
      // Final guard
      desiredLeft = Math.max(leftBound2, Math.min(rightBound2, q))
    }

    this.currentX.set(dragId, desiredLeft)

    // Resolve overlaps to the right
    {
      const GAP = 0
      for (let i = idx + 1; i < this.order.length; i++) {
        const prevId = this.order[i - 1]
        const curId = this.order[i]
        const prevW = this.modules.find((m) => m.id === prevId)?.w ?? 0
        const curW = this.modules.find((m) => m.id === curId)?.w ?? 0
        const needed = (this.currentX.get(prevId) ?? 0) + prevW + GAP
        let curX = this.currentX.get(curId) ?? 0
        if (curX < needed) {
          curX = needed
          const curMax = Math.max(0, rackRect.width / scale - curW)
          if (curX > curMax) curX = curMax
          this.currentX.set(curId, curX)
        }
      }
    }
    // Resolve overlaps to the left (allow left-most at exactly 0)
    {
      const GAP = 0
      for (let i = idx - 1; i >= 0; i--) {
        const nextId = this.order[i + 1]
        const curId = this.order[i]
        const curW = this.modules.find((m) => m.id === curId)?.w ?? 0
        const needed = (this.currentX.get(nextId) ?? 0) - curW - GAP
        let curX = this.currentX.get(curId) ?? 0
        if (curX > needed) {
          curX = needed
          if (curX < 0) curX = 0
          this.currentX.set(curId, curX)
        }
      }
    }

    const disp = new Map<string, number>()
    for (const mm of this.modules) {
      const x0 = this.initialX.get(mm.id) ?? mm.x
      const x1 = this.currentX.get(mm.id) ?? mm.x
      disp.set(mm.id, x1 - x0)
    }
    this.displaced = disp
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
      // Clear any custom drag affordances
      m.el.style.outline = ''
      m.el.style.outlineOffset = ''
      m.el.style.filter = ''
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
    requestAnimationFrame(() => this.apply())
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
      if (dragged) {
        if (dx !== 0) {
          dragged.el.style.transform = `translate3d(${dx}px, 0, 0)`
        } else {
          // Avoid setting a zero-translate that can cause subpixel shifts
          dragged.el.style.transform = ''
        }
      }
    }
    // Ask wires to refresh and ensure centers are measured this frame
    try {
      window.dispatchEvent(new Event('wires:refresh'))
    } catch {}
  }
}
