"use client"

import type React from "react"

import { cn } from "@/lib/utils"

interface TextLabelProps {
  children: React.ReactNode
  className?: string
  variant?: "port" | "control" | "parameter"
}

export function TextLabel({ children, className, variant = "port" }: TextLabelProps) {
  const baseClasses = "text-xs select-none text-center [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]"

  const variantClasses = {
    port: "flex flex-1 items-center justify-center text-white text-[9px] font-bold rounded-[3px] text-center leading-[9px] uppercase w-full",
    control: "font-bold text-[9px] uppercase text-black leading-[10px]",
    parameter: "font-medium mb-2",
  }

  return <div className={cn(baseClasses, variantClasses[variant], className)}>{children}</div>
}
