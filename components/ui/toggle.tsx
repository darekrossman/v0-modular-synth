'use client'

import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm text-[10px] text-neutral-700 font-mono font-medium hover:bg-neutral-400 hover:text-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:outline-0 whitespace-nowrap data-[state=on]:bg-blue-500 data-[state=on]:text-white cursor-pointer",
  {
    variants: {
      variant: {
        default: 'bg-neutral-400/50 data-[state=on]:border-0 rounded-sm',
        outline:
          'border border-input shadow-xs hover:bg-accent hover:text-accent-foreground',
        push: 'rounded-full border border-neutral-600 bg-radial-[at_50%_50%] from-neutral-400/80 from-20% to-neutral-200 to-80% data-[state=on]:from-red-500 data-[state=on]:to-red-600 data-[state=on]:to-100% data-[state=on]:from-40% shadow-[inset_0_-1px_2px_0px_rgba(0,0,0,0.3),inset_0_2px_3px_0px_rgba(255,255,255,1)] data-[state=on]:shadow-[inset_0_1px_0px_0px_rgba(255,255,255,0.2),0_0_6px_1px_rgba(255,0,0,0.5)] data-[state=on]:border-red-800',
        sequencer:
          'rounded-full border border-neutral-600 bg-radial-[at_50%_50%] from-neutral-400/80 from-20% to-neutral-200 to-80% data-[state=on]:from-blue-500 data-[state=on]:to-blue-600 data-[state=on]:to-100% data-[state=on]:from-40% shadow-[inset_0_-1px_2px_0px_rgba(0,0,0,0.3),inset_0_2px_3px_0px_rgba(255,255,255,1)] data-[state=on]:shadow-[inset_0_1px_0px_0px_rgba(255,255,255,0.2),0_0_6px_1px_rgba(50,50,255,0.9)] data-[state=on]:border-blue-800',
      },
      active: {
        true: 'from-red-500! from-20% to-red-600! to-80% text-white data-[state=on]:text-white shadow-[inset_0_-1px_0px_0px_rgba(0,0,0,0.2),inset_0_1px_0px_0px_rgba(255,255,255,0.2)] data-[state=on]:shadow-[inset_0_1px_0px_0px_rgba(255,255,255,0.2),0_0_6px_1px_rgba(255,0,0,0.5)] shadow-[inset_0_1px_0px_0px_rgba(255,255,255,0.2),0_0_6px_1px_rgba(255,0,0,0.5)] data-[state=on]:border-red-800 border-red-900',
      },
      size: {
        xs: 'h-5 min-w-5 px-1 empty:p-0',
        default: 'h-8 min-w-8 px-1 empty:p-0',
        md: 'h-6 min-w-6 px-1 empty:p-0',
        sm: 'h-5 min-w-5 px-1 empty:p-0',
        lg: 'h-10 px-2.5 min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Toggle({
  className,
  variant,
  size,
  active,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className, active }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
