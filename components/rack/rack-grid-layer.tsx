'use client'

import * as React from 'react'
import { useLayout } from '@/components/layout-context'
import { cn } from '@/lib/utils'

export function RackGridLayer({
  numRows,
  rowHeightPx,
}: {
  numRows: number
  rowHeightPx: number
}) {
  const rowRefs = React.useRef<(HTMLDivElement | null)[]>([])
  const { setGetRackRect } = useLayout()

  React.useEffect(() => {
    setGetRackRect(
      (idx: number) =>
        rowRefs.current[idx - 1]?.getBoundingClientRect() ?? null,
    )
  }, [setGetRackRect])

  return (
    <>
      {Array.from({ length: numRows }, (_, i) => {
        const rackNum = i + 1
        return (
          <React.Fragment key={`grid-row-${rackNum}`}>
            <div
              ref={(el) => {
                rowRefs.current[i] = el
              }}
              className={cn(
                'relative w-full bg-gradient-to-b from-rack-background/80 to-rack-background/85',
              )}
              style={{ height: rowHeightPx }}
            >
              <Rail position="top" />
              <Rail position="bottom" />
            </div>
            {rackNum < numRows && <div className="border-t border-white/20" />}
          </React.Fragment>
        )
      })}
    </>
  )
}

function Rail({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div
      className={cn('absolute left-0 w-full h-5 bg-rail-background z-0', {
        'bottom-0': position === 'bottom',
        'top-0': position === 'top',
        'shadow-[0_1px_0px_0_rgba(0,0,0,0.4)]': position === 'top',
        'shadow-[0_-1px_0px_0_rgba(255,255,255,0.2)]': position === 'bottom',
      })}
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-white/5 shadow-[0_1px_2px_0_rgba(0,0,0,0.6)]" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-white/5 shadow-[0_-1px_1px_0_rgba(255,255,255,0.2)]" />
    </div>
  )
}
