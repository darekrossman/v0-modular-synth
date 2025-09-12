// Unified packing helpers for module layout
// Keep grid constants centralized

export const HP_PX = 20 // 20px increments per spec
export const GAP_PX = 0 // no horizontal gap between modules when packing

export const toPx = (hp: number): number => hp * HP_PX
export const toHp = (px: number): number => Math.max(0, Math.round(px / HP_PX))

export type PackItem = { id: string; x: number; w: number }

// Pack an existing set left-to-right preserving order and gaps
export function packWithout(
  existing: PackItem[],
  rowWidth: number,
): Array<{ id: string; x: number }> {
  const sorted = existing.slice().sort((a, b) => a.x - b.x)
  const updates: Array<{ id: string; x: number }> = []
  let cursor = 0
  for (let i = 0; i < sorted.length; i++) {
    const nx = Math.max(
      0,
      Math.min(
        Math.max(0, rowWidth - sorted[i].w),
        Math.max(cursor, sorted[i].x),
      ),
    )
    if (nx !== sorted[i].x) updates.push({ id: sorted[i].id, x: nx })
    cursor = nx + sorted[i].w + GAP_PX
  }
  return updates
}

// Insert a virtual item, resolve overlaps by sweeping, and return updated positions and the dragged x
export function packWithVirtual(
  existing: PackItem[],
  insert: { x: number; w: number },
  rowWidth: number,
): { updates: Array<{ id: string; x: number }>; draggedX: number } {
  const clampedX = Math.max(
    0,
    Math.min(Math.max(0, rowWidth - insert.w), insert.x),
  )
  const all: PackItem[] = [
    ...existing.map((m) => ({ ...m })),
    { id: '__virtual__', x: clampedX, w: insert.w },
  ]
  all.sort((a, b) => a.x - b.x)
  // Sweep right
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i]
    const b = all[i + 1]
    const minB = a.x + a.w + GAP_PX
    if (b.x < minB) b.x = minB
  }
  // Sweep left
  for (let i = all.length - 1; i > 0; i--) {
    const b = all[i]
    const a = all[i - 1]
    const maxA = b.x - a.w - GAP_PX
    if (a.x > maxA) a.x = maxA
  }
  const updates = existing.map((m) => {
    const after = all.find((x) => x.id === m.id)
    return { id: m.id, x: after ? after.x : m.x }
  })
  const draggedAfter = all.find((x) => x.id === '__virtual__')
  return { updates, draggedX: draggedAfter ? draggedAfter.x : clampedX }
}
