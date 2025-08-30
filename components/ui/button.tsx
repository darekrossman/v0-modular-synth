import type * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xs text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 outline-none focus-visible:ring-0 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive cursor-pointer shadow-[0_0_0_1px_rgba(0,0,0,0.5)]",
  {
    variants: {
      variant: {
        default: "bg-neutral-400 text-black border-t border-t-white/50 border-b border-b-black/30",
        selected: "bg-neutral-800 text-white border-t border-t-white/30 border-b border-b-black/30",
        destructive:
          "bg-destructive texxs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-tranxs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary: "bg-black/40 text-white border-b border-b-white/10 shadow-[inset_0_1px_1px_0_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.5)]",
        ghost: "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        module:
          "bg-slate-800 text-slate-100 border border-slate-600 shadow-sm hover:bg-slate-700 hover:border-slate-500 focus-visible:ring-slate-400/50",
        transport:
          "bg-green-600 text-white shadow-sm hover:bg-green-500 focus-visible:ring-green-400/50 disabled:bg-slate-600",
        stop: "bg-red-600 text-white shadow-sm hover:bg-red-500 focus-visible:ring-red-400/50",
        record:
          "bg-red-700 text-white shadow-sm hover:bg-red-600 focus-visible:ring-red-400/50 data-[recording=true]:bg-red-500 data-[recording=true]:animate-pulse",
        utility: "bg-slate-600 text-slate-100 shadow-sm hover:bg-slate-500 focus-visible:ring-slate-400/50 text-xs",
        push: "rounded-full w-12! h-12! bg-radial from-neutral-500 from-30% to-neutral-700 hover:from-neutral-500/80 active:from-red-600 active:from-10% active:to-red-500 border-b border-b-black/40 active:border-b-black/5 active:border-t-red-700/50 shadow-xs active:shadow-none transition active:scale-95"
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        xs: "h-5 px-1 py-0 text-[9px]",
        square: "size-8 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button, buttonVariants }
