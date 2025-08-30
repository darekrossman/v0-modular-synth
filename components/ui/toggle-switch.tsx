"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { TextLabel } from "@/components/text-label"

interface ToggleSwitchProps {
  value: boolean
  onValueChange: (value: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}

const ToggleSwitch = React.forwardRef<HTMLButtonElement, ToggleSwitchProps>(
  ({ value, onValueChange, label, disabled = false, className }, ref) => {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          ref={ref}
          className={cn(
            "relative w-5 h-10 px-0.5 focus-visible:outline-none border-t border-t-black/20 border-b rounded-xs transition cursor-pointer",
            value ? "bg-neutral-800/50 border-b-white/10 delay-50" : "bg-neutral-800/40 hover:bg-neutral-800/35 border-b-white/20 duration-0",
            disabled && "opacity-50 cursor-not-allowed",
            className,
          )}
          style={{boxShadow: 'inset 0px 0px 2px 0px rgba(0,0,0,0.3)'}}
          onClick={() => !disabled && onValueChange(!value)}
          disabled={disabled}
          role="switch"
          aria-checked={value}
          type="button"
        >
          <div
            className={cn(
              "flex flex-col gap-[1px] px-1 justify-center w-4 h-4 bg-neutral-900 shadow-[0_-0.5px_0_0_rgba(255,255,255,0.15)] rounded-xs transition",
              value ? "translate-y-[-10px]" : "translate-y-[9px]",
            )}
          >
            <div className="h-[2px] bg-white/20 border-b"/>
            <div className="h-[2px] bg-white/25 border-b"/>
            <div className="h-[2px] bg-white/20 border-b"/>
          </div>
        </button>

        {label && <TextLabel variant="control">{label}</TextLabel>}
      </div>
    )
  },
)

ToggleSwitch.displayName = "ToggleSwitch"

export { ToggleSwitch }
