interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  description?: string
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 w-full text-left group"
    >
      <div
        className={`
          relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 mt-0.5
          ${checked ? 'bg-accent' : 'bg-subtle'}
        `}
      >
        <div
          className={`
            absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200
            ${checked ? 'translate-x-5' : 'translate-x-1'}
          `}
        />
      </div>
      {(label || description) && (
        <div>
          {label && <p className="text-sm font-medium text-white">{label}</p>}
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      )}
    </button>
  )
}
