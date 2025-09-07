// Helper to get shared AudioContext
export function getAudioContext(): AudioContext {
  const w: Window & { __ac?: AudioContext } = window
  if (!w.__ac) w.__ac = new window.AudioContext()
  if (w.__ac.state === 'suspended') w.__ac.resume()
  return w.__ac as AudioContext
}

// Reset and destroy the shared AudioContext so the next caller gets a fresh one
export async function resetAudioContext(): Promise<void> {
  const w: Window & { __ac?: AudioContext } = window
  if (w.__ac) {
    try {
      await w.__ac.close()
    } catch {}
    try {
      delete (w as any).__ac
    } catch {
      ;(w as any).__ac = undefined
    }
  }
}
