'use client'

import * as React from 'react'
import { TextLabel } from '@/components/text-label'
import { cn } from '@/lib/utils'

interface KnobProps {
  value?: number[] // Made value prop optional for uncontrolled mode
  defaultValue?: number[] // Added defaultValue prop for uncontrolled mode
  onValueChange?: (value: number[]) => void
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  label?: string
  tickCount?: number // Number of tick marks around the knob
  tickLabels?: number[] | string[] // Optional labels for tick marks
  showTicks?: boolean // Whether to show tick marks at all
  steps?: number // Number of discrete steps (e.g., steps=5 creates 0.0, 0.25, 0.5, 0.75, 1.0)
  turnSpeed?: 'slow' | 'medium' | 'fast' // Controls the default turn sensitivity
  ref?: React.RefObject<HTMLDivElement>
}

export const Knob = React.memo(
  ({
    value,
    defaultValue,
    onValueChange,
    size = 'md',
    className,
    disabled = false,
    label,
    tickCount = 11,
    tickLabels,
    showTicks = true,
    steps,
    turnSpeed = 'medium',
    ref,
    ...props
  }: KnobProps) => {
    const [internalValue, setInternalValue] = React.useState(
      defaultValue || [0],
    )
    const [isDragging, setIsDragging] = React.useState(false)
    // Drag anchor refs to avoid snapping when toggling Shift mid-drag
    const anchorYRef = React.useRef(0)
    const anchorValueRef = React.useRef(0)
    const currentValueRef = React.useRef(0)
    const isDraggingRef = React.useRef(false)

    const isControlled = value !== undefined
    const currentValueArray = isControlled ? value : internalValue
    let currentValue = Math.max(0, Math.min(1, currentValueArray[0] || 0))

    if (steps && steps > 1) {
      currentValue = Math.round(currentValue * (steps - 1)) / (steps - 1)
    }

    const sizeClasses = {
      xs: 'w-5 h-5',
      sm: 'w-7 h-7',
      md: 'w-10 h-10',
      lg: 'w-16 h-16',
    }

    // SVG viewBox and radius configuration for each size
    // const svgConfig = {
    //   xs: { viewBox: 24, radius: 10, strokeWidth: 3 },
    //   sm: { viewBox: 32, radius: 10, strokeWidth: 3.5 },
    //   md: { viewBox: 48, radius: 21, strokeWidth: 4 },
    //   lg: { viewBox: 80, radius: 32, strokeWidth: 6 },
    // }

    const skirtSizeClass = {
      xs: 'p-[0px]',
      sm: 'p-[2px]',
      md: 'p-[3px]',
      lg: 'p-[3px]',
    }

    const tickSizeClasses = {
      xs: { length: 'w-[1px] h-[1px]', radius: 13, fontSize: 'text-[7px]' },
      sm: { length: 'w-[1px] h-[2px]', radius: 18, fontSize: 'text-[7px]' },
      md: { length: 'w-[1px] h-[8px]', radius: 24, fontSize: 'text-[7px]' },
      lg: { length: 'w-[2px] h-[4px]', radius: 37, fontSize: 'text-[7px]' },
    }

    const padSizeClasses = {
      xs: 'gap-1.5',
      sm: 'gap-3',
      md: 'gap-3',
      lg: 'gap-4',
    }

    const smallStroke = size === 'xs' || size === 'sm'

    const handleMouseDown = (e: React.MouseEvent) => {
      if (disabled) return
      setIsDragging(true)
      isDraggingRef.current = true
      anchorYRef.current = e.clientY
      // Use the most recent value as the starting anchor for this drag
      anchorValueRef.current = currentValueRef.current
      e.preventDefault()
    }

    const handleMouseMove = React.useCallback(
      (e: MouseEvent) => {
        if (!isDraggingRef.current) return

        // Compute delta from the last processed event to make modifier toggling smooth
        const deltaY = anchorYRef.current - e.clientY // Inverted: up = increase

        let newValue

        if (steps && steps > 1) {
          // For stepped knobs, use a different approach:
          // Calculate how many pixels per step
          const pixelsPerStep = e.shiftKey ? 40 : 15 // Fewer pixels = easier to change

          // Use Math.trunc instead of Math.floor to handle negative deltas correctly
          const stepChange = Math.trunc(deltaY / pixelsPerStep)

          // Convert current value to step index
          const currentStep = Math.round(anchorValueRef.current * (steps - 1))
          const newStep = Math.max(
            0,
            Math.min(steps - 1, currentStep + stepChange),
          )

          newValue = newStep / (steps - 1)

          // Only update anchor if we actually changed steps
          if (newStep !== currentStep) {
            // Reset the anchor point relative to the new step position
            // This prevents accumulating fractional pixels
            anchorYRef.current = e.clientY
            anchorValueRef.current = newValue
          }
        } else {
          // Map turnSpeed to base sensitivity (units per pixel)
          const baseSensitivity =
            turnSpeed === 'slow'
              ? 1 / 600
              : turnSpeed === 'fast'
                ? 1 / 110
                : 1 / 220

          const effectiveSensitivity = e.shiftKey
            ? baseSensitivity / 10
            : baseSensitivity

          newValue = Math.max(
            0,
            Math.min(1, anchorValueRef.current + deltaY * effectiveSensitivity),
          )
        }

        const newValueArray = [newValue]

        // Persist value for subsequent incremental deltas
        currentValueRef.current = newValue
        // Don't update anchors here for stepped knobs - we do it above when step changes
        if (!steps || steps <= 1) {
          anchorYRef.current = e.clientY
          anchorValueRef.current = newValue
        }

        if (!isControlled) {
          setInternalValue(newValueArray)
        }
        onValueChange?.(newValueArray)
      },
      [isControlled, steps, onValueChange, turnSpeed],
    )

    const handleMouseUp = React.useCallback(() => {
      setIsDragging(false)
      isDraggingRef.current = false
    }, [])

    React.useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        return () => {
          document.removeEventListener('mousemove', handleMouseMove)
          document.removeEventListener('mouseup', handleMouseUp)
        }
      }
    }, [isDragging, handleMouseMove, handleMouseUp])

    // Keep an up-to-date ref of the current value to use as an anchor at drag start
    React.useEffect(() => {
      currentValueRef.current = currentValue
    }, [currentValue])

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
        const labelX =
          Math.cos(radian) * (tickSize.radius + (size === 'lg' ? 10 : 8))
        const labelY =
          Math.sin(radian) * (tickSize.radius + (size === 'lg' ? 10 : 8))

        size !== 'xs' &&
          ticks.push(
            <div key={i}>
              {/* Tick mark */}
              {/* <div
                className={cn(
                  'absolute bg-module-foreground rounded-sm',
                  tickSize.length,
                )}
                style={{
                  left: `calc(50% + ${tickX}px)`,
                  top: `calc(50% + ${tickY}px)`,
                  transform: `translate(-50%, -50%) rotate(${angle + 90}deg)`,
                }}
              /> */}

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
    const radius = tickSizeClasses[size].radius
    const viewBox = radius * 2 + 2
    const center = viewBox / 2

    const getCoordinatesForAngle = (angle: number) => {
      const rad = (angle - 90) * (Math.PI / 180)
      const x = center + radius * Math.cos(rad)
      const y = center + radius * Math.sin(rad)
      return { x, y }
    }

    const start = getCoordinatesForAngle(-135)
    const end = getCoordinatesForAngle(135)
    const circumference = 2 * Math.PI * radius
    const arcLength = circumference * (270 / 360)
    const pathData = `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`
    const offset = arcLength - 1 * arcLength
    const dotRotation = -135 + 1 * 270
    console.log('knob', label)
    return (
      <div
        className={cn(
          'flex flex-col items-center',
          padSizeClasses[size],
          className,
        )}
      >
        {label && (
          <TextLabel
            variant="control"
            className={cn({
              'text-xs': size === 'lg',
              'text-[10px]': size === 'md',
            })}
          >
            {label}
          </TextLabel>
        )}

        <div className="relative">
          <svg
            width={viewBox}
            height={viewBox}
            viewBox={`0 0 ${viewBox} ${viewBox}`}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none`}
          >
            <defs>
              <path id={`knob-path-${radius}`} d={pathData} />
            </defs>
            <use
              href={`#knob-path-${radius}`}
              className="stroke-knob-outer-ring fill-none"
              strokeWidth="0.75"
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
              'bg-knob-background relative rounded-full cursor-pointer select-none',
              'focus-visible:outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_2px_0_rgba(0,0,0,0.3),0_4px_0_0_rgba(0,0,0,0.2)]',
              sizeClasses[size],
              skirtSizeClass[size],
              disabled && 'opacity-50 cursor-not-allowed',
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

            <div className={`relative w-full h-full rounded-full`}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`absolute rounded-full`}
                  style={{
                    width:
                      size === 'xs'
                        ? '2px'
                        : size === 'sm'
                          ? '3px'
                          : size === 'md'
                            ? '4px'
                            : '5px',
                    height: '50%',
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: 'center bottom',
                    top: 0,
                    left: '50%',
                    marginLeft:
                      size === 'xs'
                        ? '-1px'
                        : size === 'sm'
                          ? '-1.5px'
                          : size === 'md'
                            ? '-2px'
                            : '-2.5px',
                  }}
                >
                  <div
                    className="w-full h-[60%] bg-knob-foreground rounded-full"
                    style={{
                      marginTop: size === 'xs' ? '2px' : '0px',
                    }}
                  />
                </div>
              </div>
              {/* <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[47%] h-[47%] rounded-full bg-gradient-to-b from-neutral-900 to-neutral-600 to-85% shadow-[inset_0_-1px_1px_rgba(255,255,255,0.2),inset_0_1px_0px_rgba(0,0,0,0.0)]" />
              </div> */}
            </div>
          </div>
        </div>
      </div>
    )
  },
)
