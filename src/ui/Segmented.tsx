import { cn } from './cn.ts'

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-charcoal-4 bg-charcoal-2 p-1" role="tablist" aria-label={label}>
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              'hit-slop-sm min-h-11 flex-1 rounded-lg px-2 py-2 text-xs font-medium transition',
              selected ? 'bg-charcoal text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
