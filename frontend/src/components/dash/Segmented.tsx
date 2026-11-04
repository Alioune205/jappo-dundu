export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Effectif affiché à côté du libellé. */
  count?: number
}

interface SegmentedProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentedOption<T>[]
  ariaLabel: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Sélecteur segmenté unique de l'application : segments de même largeur,
 * curseur qui glisse sous le choix actif.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'sm',
  className = '',
}: SegmentedProps<T>) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )
  const height = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`relative inline-grid auto-cols-fr grid-flow-col rounded-full bg-track p-1 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-surface shadow-[0_1px_2px_rgb(16_24_40/0.08),0_0_0_1px_var(--line)] transition-[translate] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, translate: `${index * 100}% 0` }}
      />
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`relative z-10 inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 font-medium transition-colors ${height} ${
              active ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`num text-2xs ${active ? 'text-muted' : 'text-subtle'}`}>{option.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
