"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { TextLabel } from "@/components/text-label"

interface KnobProps {
  value?: number[] // Made value prop optional for uncontrolled mode
  defaultValue?: number[] // Added defaultValue prop for uncontrolled mode
  onValueChange?: (value: number[]) => void
  size?: "xs" | "sm" | "md" | "lg"
  className?: string
  disabled?: boolean
  label?: string
  tickCount?: number // Number of tick marks around the knob
  tickLabels?: number[] | string[] // Optional labels for tick marks
  showTicks?: boolean // Whether to show tick marks at all
  steps?: number // Number of discrete steps (e.g., steps=5 creates 0.0, 0.25, 0.5, 0.75, 1.0)
}

const Knob = React.forwardRef<HTMLDivElement, KnobProps>(
  (
    {
      value,
      defaultValue,
      onValueChange,
      size = "md",
      className,
      disabled = false,
      label,
      tickCount = 11,
      tickLabels,
      showTicks = true,
      steps,
      ...props
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue || [0])
    const [isDragging, setIsDragging] = React.useState(false)
    const [startY, setStartY] = React.useState(0)
    const [startValue, setStartValue] = React.useState(0)
    const knobRef = React.useRef<HTMLDivElement>(null)

    const isControlled = value !== undefined
    const currentValueArray = isControlled ? value : internalValue
    let currentValue = Math.max(0, Math.min(1, currentValueArray[0] || 0))

    if (steps && steps > 1) {
      currentValue = Math.round(currentValue * (steps - 1)) / (steps - 1)
    }

    const sizeClasses = {
      xs: "w-6 h-6",
      sm: "w-8 h-8",
      md: "w-12 h-12",
      lg: "w-20 h-20",
    }

    const skirtSizeClass = {
      xs: "p-[0px]",
      sm: "p-[2px]",
      md: "p-[3px]",
      lg: "p-[3px]",
    }

    const tickSizeClasses = {
      xs: { length: "w-[1px] h-[1px]", radius: 14, fontSize: "text-[8px]" },
      sm: { length: "w-[1px] h-[3px]", radius: 19, fontSize: "text-[8px]" },
      md: { length: "w-[1px] h-[4px]", radius: 28, fontSize: "text-[8px]" },
      lg: { length: "w-[1px] h-[6px]", radius: 45, fontSize: "text-[8px]" },
    }

    const padSizeClasses = {
      xs: "w-7 mt-1",
      sm: "w-12 mt-1.5",
      md: "w-[60px] mt-2",
      lg: "w-[100px] mt-3",
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

        const deltaY = startY - e.clientY // Inverted: up = increase
        const baseSensitivity = 1 / 200 // 1 unit over 200 pixels
        // Hold Shift for fine control at 1/10th speed
        const effectiveSensitivity = (e.shiftKey ? baseSensitivity / 10 : baseSensitivity)
        let newValue = Math.max(0, Math.min(1, startValue + deltaY * effectiveSensitivity))

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

    const effectiveTickCount = tickLabels ? tickLabels.length : tickCount

    const renderTickMarks = () => {
      if (!showTicks) return null

      const ticks = []
      const tickSize = tickSizeClasses[size]
      const useShorterRange = tickLabels && tickLabels.length <= 5
      const totalAngle = useShorterRange ? 130 : 270
      const startAngle = useShorterRange ? -155 : -225

      for (let i = 0; i < effectiveTickCount; i++) {
        const angle = startAngle + (i / (effectiveTickCount - 1)) * totalAngle
        const radian = (angle * Math.PI) / 180

        // Position for tick marks
        const tickX = Math.cos(radian) * tickSize.radius
        const tickY = Math.sin(radian) * tickSize.radius

        // Position for labels (slightly further out)
        const labelX = Math.cos(radian) * (tickSize.radius + (size === "lg" ? 10 : 8))
        const labelY = Math.sin(radian) * (tickSize.radius + (size === "lg" ? 10 : 8))

        ticks.push(
          <div key={i}>
            {/* Tick mark */}
            <div
              className={cn("absolute bg-neutral-800 rounded-sm", tickSize.length)}
              style={{
                left: `calc(50% + ${tickX}px)`,
                top: `calc(50% + ${tickY}px)`,
                transform: `translate(-50%, -50%) rotate(${angle + 90}deg)`,
              }}
            />

            {/* Optional label */}
            {tickLabels && tickLabels[i] != null && (
              <div
                className={cn(
                  "absolute text-neutral-800 font-mono select-none pointer-events-none leading-tight",
                  tickSize.fontSize,
                )}
                style={{
                  left: `calc(50% + ${labelX}px)`,
                  top: `calc(50% + ${labelY}px)`,
                  transform: "translate(-50%, -50%)",
                }}
              >
                {tickLabels[i]}
              </div>
            )}
          </div>,
        )
      }

      return ticks
    }

    const useShorterRange = tickLabels && tickLabels.length <= 5
    const rotationRange = useShorterRange ? 130 : 270
    const rotationOffset = useShorterRange ? -65 : -135
    const rotation = currentValue * rotationRange + rotationOffset

    return (
      <div className={cn("flex flex-col items-center gap-2", padSizeClasses[size], className)}>
        <div className="relative">
          {showTicks && <div className="absolute inset-0 pointer-events-none">{renderTickMarks()}</div>}

          <div
            ref={ref}
            className={cn(
              "relative rounded-full cursor-pointer select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "transition-colors",
              sizeClasses[size],
              skirtSizeClass[size],
              disabled && "opacity-50 cursor-not-allowed",
            )}
            onMouseDown={handleMouseDown}
            tabIndex={0}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={currentValue}
            style={{
              background: "linear-gradient(0deg, rgb(0, 0, 0) 60% 0%, rgb(69 69 69) 100%)",
            }}
            {...props}
          >
            <div
              className={`relative w-full h-full rounded-full bg-neutral-900 border-t ${size === "xs" ? "border-t-white/30" : "border-t-white/20"} border-b border-b-black shadow-[0px_2px_0px_0px_rgba(0,0,0,0.2)]`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="absolute w-0.5 bg-primary rounded-full"
                  style={{
                    height: "50%",
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: "center bottom",
                    top: "0%",
                    left: "50%",
                    marginLeft: "-1px",
                  }}
                />
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className={cn("rounded-full bg-neutral-900 w-[50%] h-[50%]")} />
              </div>
            </div>
          </div>
        </div>

        {label && <TextLabel variant="control">{label}</TextLabel>}
      </div>
    )
  },
)

Knob.displayName = "Knob"

export { Knob }
