"use client"

import type React from "react"
import { TextLabel } from "../text-label"
import { cn } from "@/lib/utils"

interface PushButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  labelClassName?: string
  size?: "sm" | "md" | "lg"
  feel?: "plastic" | "rubber"
}

const sizeVariants = {
  sm: {
    button: "h-5 w-5",
    gap: "gap-0.5",
  },
  md: {
    button: "h-9 w-9",
    gap: "gap-2",
  },
  lg: {
    button: "h-10 w-10",
    gap: "gap-1",
  },
}

const feelVariants = {
  plastic:
    "bg-red-500 active:bg-red-700",
  rubber:
    "bg-radial from-neutral-400 from-40% to-neutral-500 hover:from-neutral-500/80 active:from-red-600 active:from-10% active:to-red-300 border-b border-b-black/40 active:border-b-black/5 active:border-t-red-700/50 shadow-xs active:shadow-none transition active:scale-95",
}

export function PushButton({
  label,
  labelClassName,
  className,
  children,
  size = "md",
  feel = "plastic",
  ...props
}: PushButtonProps) {
  const sizeClasses = sizeVariants[size]
  const feelClasses = feelVariants[feel]

  return (
    <div className={cn("flex flex-col items-center", sizeClasses.gap)}>
      <TextLabel variant="control" className={cn("text-center", labelClassName)}>
        {label}
      </TextLabel>

      <button
        className={cn(
          // Base push button styling
          "inline-flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer p-[1px]",
          feelClasses,
          // Size variant
          sizeClasses.button,
          className,
        )}
        {...props}
      />
    </div>
  )
}
