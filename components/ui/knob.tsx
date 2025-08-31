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

    // SVG viewBox and radius configuration for each size
    const svgConfig = {
      xs: { viewBox: 24, radius: 10, strokeWidth: 3 },
      sm: { viewBox: 32, radius: 14, strokeWidth: 3.5 },
      md: { viewBox: 48, radius: 21, strokeWidth: 4 },
      lg: { viewBox: 80, radius: 36, strokeWidth: 6 },
    }

    const skirtSizeClass = {
      xs: "p-[0px]",
      sm: "p-[2px]",
      md: "p-[3px]",
      lg: "p-[3px]",
    }

    const tickSizeClasses = {
      xs: { length: "w-[1px] h-[1px]", radius: 14, fontSize: "text-[7px]" },
      sm: { length: "w-[1px] h-[2px]", radius: 19, fontSize: "text-[7px]" },
      md: { length: "w-[2px] h-[3px]", radius: 28, fontSize: "text-[7px]" },
      lg: { length: "w-[2px] h-[6px]", radius: 45, fontSize: "text-[7px]" },
    }

    const padSizeClasses = {
      xs: "w-7",
      sm: "w-12",
      md: "w-[60px]",
      lg: "w-[100px]",
    }

    const smallStroke = size === "xs" || size === "sm"

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
              className={cn("absolute bg-neutral-900 rounded-sm", tickSize.length)}
              style={{
                left: `calc(50% + ${tickX}px)`,
                top: `calc(50% + ${tickY}px)`,
                transform: `translate(-50%, -50%) rotate(${angle + 90}deg)`,
              }}
            />

            {/* Optional label */}
            {/* {tickLabels && tickLabels[i] != null && (
              <div
                className={cn(
                  "absolute text-neutral-900 font-mono select-none pointer-events-none leading-tight",
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
            )} */}
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
      <div className={cn("flex flex-col items-center gap-1", padSizeClasses[size], className)}>
        <div className="relative">
          {showTicks && <div className="absolute inset-0 pointer-events-none">{renderTickMarks()}</div>}

          <div
            ref={ref}
            className={cn(
              "bg-neutral-900 relative rounded-full cursor-pointer select-none",
              "focus-visible:outline-none",
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
            {...props}
          >
            {/* SVG for outer border arc */}
            {/* <svg
              className="absolute inset-0 pointer-events-none"
              viewBox={`0 0 ${svgConfig[size].viewBox} ${svgConfig[size].viewBox}`}
              width="100%"
              height="100%"
            >
              <path
                d={(() => {
                  const config = svgConfig[size];
                  const center = config.viewBox / 2;
                  const radius = config.radius;

                  // Convert angles to radians (top is -90 degrees in SVG)
                  const startAngle = (-135 - 90) * Math.PI / 180;
                  const endAngle = (135 - 90) * Math.PI / 180;

                  // Calculate start and end points
                  const startX = center + radius * Math.cos(startAngle);
                  const startY = center + radius * Math.sin(startAngle);
                  const endX = center + radius * Math.cos(endAngle);
                  const endY = center + radius * Math.sin(endAngle);

                  // Create arc path
                  return `M ${startX} ${startY} A ${radius} ${radius} 0 1 1 ${endX} ${endY}`;
                })()}
                fill="none"
                stroke="var(--color-neutral-900)"
                strokeWidth={svgConfig[size].strokeWidth}
                strokeLinecap="round"
              />
            </svg> */}

            <div
              className={`relative w-full h-full rounded-full`}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`absolute rounded-full`}
                  style={{
                    width: size === 'xs' ? '3px' : (size === 'sm' ? '4px' : (size === 'md' ? '5px' : '6px')),
                    height: '50%',
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: "center bottom",
                    top: 0,
                    left: "50%",
                    marginLeft: size === 'xs' ? '-1.5px' : (smallStroke ? "-2px" : "-3px"),
                  }}
                >
                  <div className="w-full h-[50%] bg-neutral-100 rounded-full" style={{
                    marginTop: size === 'xs' ? '2px' : '0px',
                  }} />
                </div>
              </div>
              {/* <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[47%] h-[47%] rounded-full bg-gradient-to-b from-neutral-900 to-neutral-600 to-85% shadow-[inset_0_-1px_1px_rgba(255,255,255,0.2),inset_0_1px_0px_rgba(0,0,0,0.0)]" />
              </div> */}
            </div>
          </div>
        </div>

        {label && <TextLabel variant="control" className={cn({
          'text-xs': size === 'lg',
          'text-[10px]': size === 'md'
        })}>{label}</TextLabel>}
      </div>
    )
  },
)

Knob.displayName = "Knob"

export { Knob }
