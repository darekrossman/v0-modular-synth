import { cn } from '@/lib/utils'

export const VLine = ({ className }: { className?: string }) => {
  return (
    <div
      className={cn(
        'h-3 border-l border-module-subdued mb-[-14px] mt-[-10px]',
        className,
      )}
    />
  )
}

export const HLine = ({ className }: { className?: string }) => {
  return <div className={cn('w-3 border-t border-module-subdued', className)} />
}
