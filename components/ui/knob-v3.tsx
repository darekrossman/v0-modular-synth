"use client"

import React, { useRef, useCallback, useState, useEffect } from "react"
import { cn } from "@/lib/utils"

interface KnobV3Props {
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  onValueCommit?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  size?: "xs" | "sm" | "md" | "lg"
  label?: string
  showValue?: boolean
  valueDisplay?: (value: number) => string
}

const sizeClasses = {
  xs: "w-8 h-8",
  sm: "w-10 h-10",
  md: "w-12 h-12",
  lg: "w-16 h-16",
}

const labelSizeClasses = {
  xs: "text-[9px]",
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-xs",
}

export function KnobV3({
  value: controlledValue,
  defaultValue = [0.5],
  onValueChange,
  onValueCommit,
  min = 0,
  max = 1,
  step,
  disabled = false,
  className,
  size = "md",
  label,
  showValue = false,
  valueDisplay,
}: KnobV3Props) {
  const [internalValue, setInternalValue] = useState(defaultValue)
  const value = controlledValue ?? internalValue
  const currentValue = value[0] ?? 0

  const knobRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startValue = useRef(0)

  // Normalize value to 0-1 range
  const normalizedValue = (currentValue - min) / (max - min)
  
  // Convert to angle (270 degree sweep, from -135 to +135)
  const angle = -135 + normalizedValue * 270

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return
      e.preventDefault()
      e.stopPropagation()
      
      isDragging.current = true
      startY.current = e.clientY
      startValue.current = currentValue
      
      const element = e.currentTarget as HTMLElement
      element.setPointerCapture(e.pointerId)
      
      // Add class for active state
      knobRef.current?.classList.add("knob-active")
    },
    [currentValue, disabled]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current || disabled) return
      e.preventDefault()
      
      const deltaY = startY.current - e.clientY
      const range = max - min
      const sensitivity = range / 150 // Adjust sensitivity as needed
      
      let newValue = startValue.current + deltaY * sensitivity
      
      // Apply step if specified
      if (step) {
        newValue = Math.round(newValue / step) * step
      }
      
      // Clamp to min/max
      newValue = Math.max(min, Math.min(max, newValue))
      
      const newValueArray = [newValue]
      
      if (controlledValue === undefined) {
        setInternalValue(newValueArray)
      }
      onValueChange?.(newValueArray)
    },
    [min, max, step, controlledValue, onValueChange, disabled]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return
      
      isDragging.current = false
      const element = e.currentTarget as HTMLElement
      element.releasePointerCapture(e.pointerId)
      
      // Remove active class
      knobRef.current?.classList.remove("knob-active")
      
      onValueCommit?.([currentValue])
    },
    [currentValue, onValueCommit]
  )

  // Format value for display
  const displayValue = valueDisplay ? valueDisplay(currentValue) : currentValue.toFixed(2)

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {label && (
        <span className={cn(
          "text-neutral-400 font-medium uppercase tracking-wider select-none",
          labelSizeClasses[size]
        )}>
          {label}
        </span>
      )}
      
      <div
        ref={knobRef}
        className={cn(
          "relative cursor-pointer select-none transition-transform",
          "hover:scale-105 active:scale-95",
          sizeClasses[size],
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Background circle with track */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 40 40"
        >
          {/* Outer ring */}
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-neutral-700"
          />
          
          {/* Track background */}
          <path
            d={`
              M ${20 + 14 * Math.cos((-135 * Math.PI) / 180)} ${20 + 14 * Math.sin((-135 * Math.PI) / 180)}
              A 14 14 0 1 1 ${20 + 14 * Math.cos((135 * Math.PI) / 180)} ${20 + 14 * Math.sin((135 * Math.PI) / 180)}
            `}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="text-neutral-600"
          />
          
          {/* Value track */}
          <path
            d={`
              M ${20 + 14 * Math.cos((-135 * Math.PI) / 180)} ${20 + 14 * Math.sin((-135 * Math.PI) / 180)}
              A 14 14 0 ${normalizedValue > 0.5 ? 1 : 0} 1 ${20 + 14 * Math.cos((angle * Math.PI) / 180)} ${20 + 14 * Math.sin((angle * Math.PI) / 180)}
            `}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="text-blue-500"
          />
          
          {/* Center knob */}
          <circle
            cx="20"
            cy="20"
            r="10"
            className="fill-neutral-800 stroke-neutral-600"
            strokeWidth="1"
          />
          
          {/* Indicator line */}
          <line
            x1="20"
            y1="20"
            x2={20 + 7 * Math.cos((angle * Math.PI) / 180)}
            y2={20 + 7 * Math.sin((angle * Math.PI) / 180)}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-white"
          />
          
          {/* Center dot */}
          <circle
            cx="20"
            cy="20"
            r="2"
            className="fill-neutral-600"
          />
        </svg>
      </div>
      
      {showValue && (
        <span className={cn(
          "text-neutral-500 font-mono select-none",
          labelSizeClasses[size]
        )}>
          {displayValue}
        </span>
      )}
    </div>
  )
}