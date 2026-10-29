import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-medium rounded-xl transition-all select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20': variant === 'primary',
          'bg-transparent hover:bg-white/5 text-muted hover:text-white border border-border': variant === 'ghost',
          'bg-transparent hover:bg-red-500/10 text-red-400 hover:text-red-300 border border-red-500/20': variant === 'danger',
          'bg-transparent hover:bg-white/5 text-white border border-border': variant === 'outline',
        },
        {
          'text-xs px-3 py-1.5 min-h-[32px]': size === 'sm',
          'text-sm px-4 py-2.5 min-h-[44px]': size === 'md',
          'text-base px-6 py-3.5 min-h-[52px]': size === 'lg',
        },
        className,
      )}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
          {children}
        </span>
      ) : children}
    </button>
  )
}
