"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { TextLabel } from "@/components/text-label"

interface ToggleSwitchProps {
  value: boolean
  onValueChange: (value: boolean) => void
  label?: string
  topLabel?: string
  disabled?: boolean
  className?: string
}

const ToggleSwitch = React.forwardRef<HTMLButtonElement, ToggleSwitchProps>(
  ({ value, onValueChange, label, topLabel, disabled = false, className }, ref) => {
    return (
      <div className="flex flex-col items-center gap-1.5 w-9">
        {topLabel && <TextLabel variant="control">{topLabel}</TextLabel>}

        <button
          ref={ref}
          className={cn(
            "relative w-5 h-9 px-[1px] focus-visible:outline-none rounded-sm transition cursor-pointer border-2",
            value ? "bg-white delay-50" : "bg-neutral-400/30 duration-0",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
          onClick={() => !disabled && onValueChange(!value)}
          disabled={disabled}
          role="switch"
          aria-checked={value}
          type="button"
        >
          <div
            className={cn(
              "w-3.5 h-3.5 bg-neutral-900 rounded-[4px] transition",
              value ? "translate-y-[-8px]" : "translate-y-[8px]",
            )}
          />
        </button>

        {label && <TextLabel variant="control">{label}</TextLabel>}
      </div>
    )
  },
)

ToggleSwitch.displayName = "ToggleSwitch"

export { ToggleSwitch }
