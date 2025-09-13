'use client'

import * as React from 'react'
import { TextLabel } from '@/components/text-label'
import { cn } from '@/lib/utils'

interface ToggleSwitchProps {
  value: boolean
  onValueChange: (value: boolean) => void
  label?: string
  topLabel?: string
  disabled?: boolean
  className?: string
  orientation?: 'vertical' | 'horizontal'
}

const ToggleSwitch = React.forwardRef<HTMLButtonElement, ToggleSwitchProps>(
  (
    {
      value,
      onValueChange,
      label,
      topLabel,
      disabled = false,
      className,
      orientation = 'vertical',
    },
    ref,
  ) => {
    const isHorizontal = orientation === 'horizontal'

    const containerClass = isHorizontal
      ? 'flex flex-row items-center gap-1.5'
      : 'flex flex-col items-center gap-1.5 w-9'

    const buttonClass = isHorizontal
      ? 'relative w-8 h-4 px-[1px] focus-visible:outline-none rounded-xs transition cursor-pointer'
      : 'relative w-4 h-8 px-[1px] focus-visible:outline-none rounded-xs transition cursor-pointer'

    const knobClass = cn(
      'w-3.5 h-3.5 bg-module-background rounded-[3px] transition',
      isHorizontal
        ? value
          ? 'translate-x-[16px]'
          : 'translate-x-[0px]'
        : value
          ? 'translate-y-[-8px]'
          : 'translate-y-[8px]',
    )

    const trackColor = value
      ? 'bg-knob-background delay-50'
      : 'bg-knob-background duration-0'

    return (
      <div className={containerClass}>
        {isHorizontal ? (
          <>
            {label && <TextLabel variant="control">{label}</TextLabel>}
            <button
              ref={ref}
              className={cn(
                buttonClass,
                trackColor,
                disabled && 'opacity-50 cursor-not-allowed',
                className,
              )}
              onClick={() => !disabled && onValueChange(!value)}
              disabled={disabled}
              role="switch"
              aria-checked={value}
              type="button"
            >
              <div className={knobClass} />
            </button>
            {topLabel && <TextLabel variant="control">{topLabel}</TextLabel>}
          </>
        ) : (
          <>
            {topLabel && <TextLabel variant="control">{topLabel}</TextLabel>}
            <button
              ref={ref}
              className={cn(
                buttonClass,
                trackColor,
                disabled && 'opacity-50 cursor-not-allowed',
                className,
              )}
              onClick={() => !disabled && onValueChange(!value)}
              disabled={disabled}
              role="switch"
              aria-checked={value}
              type="button"
            >
              <div className={knobClass} />
            </button>
            {label && <TextLabel variant="control">{label}</TextLabel>}
          </>
        )}
      </div>
    )
  },
)

ToggleSwitch.displayName = 'ToggleSwitch'

export { ToggleSwitch }
