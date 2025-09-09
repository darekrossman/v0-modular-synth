'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const sliderVariants = cva(
  'relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
  {
    variants: {
      variant: {
        default: '',
        module: 'data-[orientation=vertical]:min-h-32', // Shorter for module controls
        fine: 'data-[orientation=horizontal]:h-2 data-[orientation=vertical]:w-2', // Thicker for fine control
        coarse:
          'data-[orientation=horizontal]:h-1 data-[orientation=vertical]:w-1', // Thinner for coarse control
      },
      size: {
        default: '',
        sm: 'data-[orientation=vertical]:min-h-24',
        md: 'data-[orientation=vertical]:min-h-36',
        lg: 'data-[orientation=vertical]:min-h-56',
        xl: 'data-[orientation=vertical]:min-h-72',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

const trackVariants = cva(
  'bg-knob-background rounded-full relative grow overflow-hidden data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2',
  {
    variants: {
      variant: {
        default: '',
        module: 'bg-muted/80', // Slightly more transparent for modules
        fine: 'data-[orientation=horizontal]:h-2 data-[orientation=vertical]:w-2',
        coarse:
          'data-[orientation=horizontal]:h-1 data-[orientation=vertical]:w-1',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

const thumbVariants = cva(
  'flex! flex-col justify-center gap-[1px] px-1 border-primary rounded-xs bg-knob-foreground block shrink-0 focus-visible:ring-0 focus-visible:outline-hidden cursor-pointer shadow-[0_3px_0_0px_rgba(0,0,0,0.3)]',
  {
    variants: {
      variant: {
        default: 'w-4 h-6',
        module: 'size-3', // Smaller for module controls
        fine: 'size-5', // Larger for precise control
        coarse: 'size-3', // Smaller for simple controls
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface SliderProps
  extends React.ComponentProps<typeof SliderPrimitive.Root>,
    VariantProps<typeof sliderVariants> {}

const Slider = React.memo(
  ({
    className,
    variant,
    size,
    defaultValue,
    value,
    min = 0,
    max = 100,
    step = 1,
    orientation = 'horizontal',
    onValueChange,
    ...props
  }: SliderProps) => {
    const _values = React.useMemo(
      () =>
        Array.isArray(value)
          ? value
          : Array.isArray(defaultValue)
            ? defaultValue
            : [min, max],
      [value, defaultValue, min, max],
    )

    const isControlled = value !== undefined
    const [internalValues, setInternalValues] =
      React.useState<number[]>(_values)
    React.useEffect(() => {
      if (isControlled && Array.isArray(value)) setInternalValues(value)
    }, [isControlled, value])

    const currentValues = isControlled ? (value as number[]) : internalValues

    const rootRef = React.useRef<HTMLSpanElement | null>(null)
    const trackRef = React.useRef<HTMLSpanElement | null>(null)

    // Thumb-drag state to keep movement relative to initial click point
    const dragState = React.useRef<{
      activeIndex: number
      offsetPx: number
      trackRect: DOMRect
    } | null>(null)

    // Prevent clicks on the track from jumping the value; only drag the thumb updates
    const handlePointerDown = React.useCallback((e: React.PointerEvent) => {
      const target = e.target as HTMLElement | null
      const isThumb = target?.closest('[data-slot="slider-thumb"]') != null
      if (!isThumb) {
        e.preventDefault()
        e.stopPropagation()
      }
    }, [])

    const valueToRatio = React.useCallback(
      (val: number) => {
        return (val - min) / (max - min || 1)
      },
      [min, max],
    )

    const ratioToValue = React.useCallback(
      (ratio: number) => {
        const unclamped = min + ratio * (max - min)
        const stepped = Math.round(unclamped / step) * step
        return Math.max(min, Math.min(max, stepped))
      },
      [min, max, step],
    )

    const posForRatio = React.useCallback(
      (rect: DOMRect, ratio: number) => {
        if (orientation === 'vertical') {
          return rect.top + (1 - ratio) * rect.height
        }
        return rect.left + ratio * rect.width
      },
      [orientation],
    )

    const ratioFromPos = React.useCallback(
      (rect: DOMRect, pos: number) => {
        let ratio: number
        if (orientation === 'vertical') {
          ratio = 1 - (pos - rect.top) / rect.height
        } else {
          ratio = (pos - rect.left) / rect.width
        }
        if (!Number.isFinite(ratio)) ratio = 0
        return Math.max(0, Math.min(1, ratio))
      },
      [orientation],
    )

    const beginThumbDrag = React.useCallback(
      (index: number, e: React.PointerEvent) => {
        const trackEl = trackRef.current
        if (!trackEl) return
        const rect = trackEl.getBoundingClientRect()
        const pointerPos = orientation === 'vertical' ? e.clientY : e.clientX
        const ratio0 = valueToRatio(currentValues[index])
        const thumbPos = posForRatio(rect, ratio0)
        const offsetPx = pointerPos - thumbPos
        dragState.current = { activeIndex: index, offsetPx, trackRect: rect }
        e.preventDefault()
        e.stopPropagation()

        const onMove = (ev: PointerEvent) => {
          const ds = dragState.current
          if (!ds) return
          const pointer = orientation === 'vertical' ? ev.clientY : ev.clientX
          const pos = pointer - ds.offsetPx
          const ratio = ratioFromPos(ds.trackRect, pos)
          const newVal = ratioToValue(ratio)
          const next = [...currentValues]
          next[index] = newVal
          if (isControlled) onValueChange?.(next)
          else
            setInternalValues((prev) => {
              const arr = [...prev]
              arr[index] = newVal
              return arr
            })
        }
        const onUp = () => {
          dragState.current = null
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp, { once: true })
      },
      [
        currentValues,
        isControlled,
        onValueChange,
        orientation,
        posForRatio,
        ratioFromPos,
        ratioToValue,
        valueToRatio,
      ],
    )

    return (
      <SliderPrimitive.Root
        data-slot="slider"
        onPointerDown={handlePointerDown}
        value={currentValues}
        min={min}
        max={max}
        step={step}
        orientation={orientation}
        className={cn(sliderVariants({ variant, size, className }))}
        {...props}
      >
        <SliderPrimitive.Track
          ref={trackRef}
          data-slot="slider-track"
          className={cn(trackVariants({ variant }))}
        >
          <SliderPrimitive.Range
            data-slot="slider-range"
            className={cn(
              'absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
            )}
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className={cn(thumbVariants({ variant }))}
            onPointerDown={(e) => beginThumbDrag(index, e)}
          ></SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Root>
    )
  },
)

export { Slider, sliderVariants }
