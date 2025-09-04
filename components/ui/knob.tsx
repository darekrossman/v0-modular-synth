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
}

const Knob = React.forwardRef<HTMLDivElement, KnobProps>(
  (
    {
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
      ...props
    },
    ref,
  ) => {
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
      sm: 'w-8 h-8',
      md: 'w-12 h-12',
      lg: 'w-20 h-20',
    }

    // SVG viewBox and radius configuration for each size
    const svgConfig = {
      xs: { viewBox: 24, radius: 10, strokeWidth: 3 },
      sm: { viewBox: 32, radius: 14, strokeWidth: 3.5 },
      md: { viewBox: 48, radius: 21, strokeWidth: 4 },
      lg: { viewBox: 80, radius: 36, strokeWidth: 6 },
    }

    const skirtSizeClass = {
      xs: 'p-[0px]',
      sm: 'p-[2px]',
      md: 'p-[3px]',
      lg: 'p-[3px]',
    }

    const tickSizeClasses = {
      xs: { length: 'w-[1px] h-[1px]', radius: 14, fontSize: 'text-[7px]' },
      sm: { length: 'w-[1px] h-[2px]', radius: 19, fontSize: 'text-[7px]' },
      md: { length: 'w-[2px] h-[3px]', radius: 28, fontSize: 'text-[7px]' },
      lg: { length: 'w-[2px] h-[6px]', radius: 45, fontSize: 'text-[7px]' },
    }

    const padSizeClasses = {
      xs: 'w-6 gap-1.5',
      sm: 'w-10 gap-2.5',
      md: 'w-[60px] gap-3.5',
      lg: 'w-[100px] gap-4.5',
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
          const newStep = Math.max(0, Math.min(steps - 1, currentStep + stepChange))
          
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
              ? 1 / 440
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
              <div
                className={cn(
                  'absolute bg-neutral-900 rounded-sm',
                  tickSize.length,
                )}
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
          {showTicks && (
            <div className="absolute inset-0 pointer-events-none">
              {renderTickMarks()}
            </div>
          )}

          <div
            ref={ref}
            className={cn(
              'bg-neutral-900 relative rounded-full cursor-pointer select-none',
              'focus-visible:outline-none',
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
                          ? '4px'
                          : size === 'md'
                            ? '5px'
                            : '6px',
                    height: '50%',
                    transform: `rotate(${rotation}deg)`,
                    transformOrigin: 'center bottom',
                    top: 0,
                    left: '50%',
                    marginLeft:
                      size === 'xs' ? '-1px' : smallStroke ? '-2px' : '-3px',
                  }}
                >
                  <div
                    className="w-full h-[50%] bg-neutral-100 rounded-full"
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

Knob.displayName = 'Knob'

export { Knob }
