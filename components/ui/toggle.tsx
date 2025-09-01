"use client"

import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm text-[10px] text-neutral-700 font-mono font-medium hover:bg-neutral-400 hover:text-white disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:outline-0 whitespace-nowrap data-[state=on]:bg-blue-500 data-[state=on]:text-white cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-neutral-400/50 data-[state=on]:border-0 rounded-sm",
        outline:
          "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground",
      },
      active: {
        true: "bg-green-500 border-0 text-white data-[state=on]:bg-green-500 data-[state=on]:text-white",
      },
      size: {
        default: "size-8",
        sm: "h-8 px-1.5 min-w-8",
        lg: "h-10 px-2.5 min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
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
