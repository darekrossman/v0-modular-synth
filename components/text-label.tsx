'use client'

import type React from 'react'

import { cn } from '@/lib/utils'

interface TextLabelProps {
  children: React.ReactNode
  className?: string
  variant?: 'port' | 'control' | 'parameter'
}

export function TextLabel({
  children,
  className,
  variant = 'port',
}: TextLabelProps) {
  const baseClasses =
    'font-mono text-xs select-none text-center tracking-[0.05em] [text-box-edge:cap_alphabetic] [text-box-trim:trim-both]'

  const variantClasses = {
    port: 'flex items-center justify-center text-black text-[9px] font-bold text-center leading-[9px] lowercase w-full',
    control: 'font-bold text-[9px] lowercase text-black leading-[10px]',
    parameter: 'font-medium mb-2',
  }

  return (
    <div className={cn(baseClasses, variantClasses[variant], className)}>
      {children}
    </div>
  )
}
