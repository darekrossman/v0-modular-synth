"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { TextLabel } from "@/components/text-label"

interface KnobV2Props {
  value?: number[]
  defaultValue?: number[]
  onValueChange?: (value: number[]) => void
  size?: "sm" | "md" | "lg"
  className?: string
  disabled?: boolean
  label?: string
  steps?: number
}

const KnobV2 = React.forwardRef<HTMLDivElement, KnobV2Props>(
  ({ value, defaultValue, onValueChange, size = "md", className, disabled = false, label, steps, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue || [0])
    const [isDragging, setIsDragging] = React.useState(false)
    const [startY, setStartY] = React.useState(0)
    const [startValue, setStartValue] = React.useState(0)

    const isControlled = value !== undefined
    const currentValueArray = isControlled ? value : internalValue
    let currentValue = Math.max(0, Math.min(1, currentValueArray[0] || 0))

    if (steps && steps > 1) {
      currentValue = Math.round(currentValue * (steps - 1)) / (steps - 1)
    }

    const sizeClasses = {
      xs: "w-8 h-8",
      sm: "w-10 h-10",
      md: "w-14 h-14",
      lg: "w-20 h-20",
    }

    const viewboxSizes = {
      xs: 32,
      sm: 40,
      md: 56,
      lg: 80
    }

    const padSizeClasses = {
      sm: "w-12 mt-1.5",
      md: "w-16 mt-2",
      lg: "w-24 mt-3",
    }

    const handleMouseDown = (e: React.MouseEvent) => {
      if (disabled) return
      setIsDragging(true)
      setStartY(e.clientY)
      setStartValue(currentValue)
      e.preventDefault()
    }

    const handleMouseMove = React.useCallback(
      (e: MouseEvent) => {
        if (!isDragging) return

        const deltaY = startY - e.clientY
        const sensitivity = 1 / 200
        let newValue = Math.max(0, Math.min(1, startValue + deltaY * sensitivity))

        if (steps && steps > 1) {
          newValue = Math.round(newValue * (steps - 1)) / (steps - 1)
        }

        const newValueArray = [newValue]

        if (!isControlled) {
          setInternalValue(newValueArray)
        }
        onValueChange?.(newValueArray)
      },
      [isDragging, startY, startValue, onValueChange, isControlled, steps],
    )

    const handleMouseUp = React.useCallback(() => {
      setIsDragging(false)
    }, [])

    React.useEffect(() => {
      if (isDragging) {
        document.addEventListener("mousemove", handleMouseMove)
        document.addEventListener("mouseup", handleMouseUp)
        return () => {
          document.removeEventListener("mousemove", handleMouseMove)
          document.removeEventListener("mouseup", handleMouseUp)
        }
      }
    }, [isDragging, handleMouseMove, handleMouseUp])

    const strokeWidth = size === 'lg' ? 4 : 3;
    const viewBox = viewboxSizes[size] + strokeWidth;
    const radius = viewBox / 2 - (size === 'lg' ? 6 : 5);
    const center = viewBox / 2;
    const circumference = 2 * Math.PI * radius;
    const arcLength = circumference * (270 / 360); // 270 degrees is 3/4 of a full circle
    const startAngle = -135;
    const endAngle = 135;
    const lg = size === 'lg'

    const getCoordinatesForAngle = (angle: number) => {
      const rad = (angle - 90) * (Math.PI / 180);
      const x = center + radius * Math.cos(rad);
      const y = center + radius * Math.sin(rad);
      return { x, y };
    };

    const start = getCoordinatesForAngle(startAngle);
    const end = getCoordinatesForAngle(endAngle);
    const pathData = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
    const offset = arcLength - (currentValue * arcLength);
    const dotRotation = -135 + currentValue * 270

    return (
      <div className={cn("flex flex-col items-center gap-2", className)}>
        <div className="relative">
          <svg width={viewBox} height={viewBox} viewBox={`0 0 ${viewBox} ${viewBox}`} className={`absolute z-1 top-[-${lg ? 2 : 1.5}px] left-[-${lg ? 2 : 1.5}px] pointer-events-none`}>
            <defs>
              <path id={`knob-path-${radius}`} d={pathData} />
            </defs>
            <use
              href={`#knob-path-${radius}`}
              className="stroke-[#00ff8d] fill-none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{
                strokeDasharray: arcLength,
                strokeDashoffset: offset,
              }}
            />
          </svg>

          <div
            ref={ref}
            className={cn(
              "relative rounded-full cursor-pointer select-none",
              "focus-visible:outline-none",
              "bg-radial-[at_50%_50%] from-neutral-500 from-20% to-neutral-100 to-100%",
              sizeClasses[size],
              disabled && "opacity-50 cursor-not-allowed",
            )}
            onMouseDown={handleMouseDown}
            tabIndex={0}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={currentValue}
            style={{
              boxShadow: "inset 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(255,255,255,0.9)",
            }}
            {...props}
          >
            {/* Inner knob surface */}
            <div
              className={`absolute inset-[${size === 'lg' ? '7' : '6'}px] rounded-full bg-radial-[at_50%_20%] from-neutral-500 to-neutral-800 to-85%`}
              style={{
                boxShadow: "inset 0 1px 1px 0px rgba(255,255,255,0.4), 0px 0px 0px 1px rgba(0,0,0,0.7)",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  transform: `rotate(${dotRotation}deg)`,
                  transformOrigin: "50% 50%",
                }}
              >
                <div
                  className={`absolute ${size === 'lg' ? 'w-1.5 h-1.5' : 'w-1 h-1'} bg-radial-[at_50%_50%] from-white/70 to-white to-100% rounded-full shadow-sm transition-all duration-75`}
                  style={{ left: "50%", top: "15%", transform: "translate(-50%, -50%)" }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {label && <TextLabel variant="control">{label}</TextLabel>}
      </div>
    )
  },
)

KnobV2.displayName = "KnobV2"

export { KnobV2 }
