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
          {/* Solid color skirt/background circle */}
          <circle
            cx="20"
            cy="20"
            r="18"
            className="fill-neutral-700"
          />
          
          {/* Center knob with wavy/fluted edge */}
          <g transform={`rotate(${angle} 20 20)`}>
            {/* Create subtle fluted/wavy edge using a path */}
            <path
              d={(() => {
                const numFlutes = 18; // More flutes for smoother appearance
                const baseRadius = 14;
                const waveAmplitude = 1.5; // Very subtle wave
                let path = '';
                const points = [];
                
                // Generate points around the circle with subtle wave
                for (let i = 0; i < numFlutes * 2; i++) {
                  const angle = (i * 360 / (numFlutes * 2)) * Math.PI / 180;
                  const isValley = i % 2 === 0;
                  const radius = baseRadius + (isValley ? -waveAmplitude * 0.3 : waveAmplitude);
                  points.push({
                    x: 20 + radius * Math.cos(angle),
                    y: 20 + radius * Math.sin(angle)
                  });
                }
                
                // Start path
                path = `M ${points[0].x} ${points[0].y}`;
                
                // Create smooth curves through all points
                for (let i = 0; i < points.length; i++) {
                  const p1 = points[i];
                  const p2 = points[(i + 1) % points.length];
                  const p3 = points[(i + 2) % points.length];
                  
                  // Use cubic bezier for smoother curves with flattened peaks
                  const cp1x = p1.x + (p2.x - p1.x) * 0.5;
                  const cp1y = p1.y + (p2.y - p1.y) * 0.5;
                  const cp2x = p2.x + (p3.x - p2.x) * 0.5;
                  const cp2y = p2.y + (p3.y - p2.y) * 0.5;
                  
                  if (i % 2 === 0) {
                    // For peaks, create flatter tops
                    path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
                  } else {
                    // For valleys, use quadratic for smoother curves
                    path += ` Q ${p2.x} ${p2.y} ${p2.x} ${p2.y}`;
                  }
                  
                  i++; // Skip next point as we've already handled it
                }
                
                path += ' Z';
                return path;
              })()}
              className="fill-neutral-800 stroke-neutral-600"
              strokeWidth="0.5"
            />
            
            {/* Indicator dot on the fluted edge */}
            <circle
              cx={20 + 13.5 * Math.cos((-90 * Math.PI) / 180)}
              cy={20 + 13.5 * Math.sin((-90 * Math.PI) / 180)}
              r="2"
              className="fill-white"
            />
          </g>
          
          {/* Center dot */}
          <circle
            cx="20"
            cy="20"
            r="3"
            className="fill-neutral-900"
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