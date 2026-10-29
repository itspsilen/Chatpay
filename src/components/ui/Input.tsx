import { clsx } from 'clsx'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        className={clsx(
          'w-full bg-surface border rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted/50',
          'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/40',
          'transition-colors',
          error ? 'border-red-500/50' : 'border-border',
          className,
        )}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
