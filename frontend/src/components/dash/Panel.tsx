import React, { useId } from 'react'

interface PanelProps {
  title: React.ReactNode
  /** Période, unité, source : ce qu'il faut savoir pour lire le contenu. */
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  /** Légende ou bilan, sous un filet. */
  footer?: React.ReactNode
  children: React.ReactNode
  /** Rang dans la cascade d'apparition. */
  i?: number
  className?: string
  bodyClassName?: string
  /** Identifiant du titre, pour aria-labelledby. */
  id?: string
}

/**
 * Panneau de tableau de bord : un titre qui dit ce qu'on regarde, un
 * sous-titre court qui dit sur quelle période et dans quelle unité, le
 * contenu, puis la légende. Aucun filet : l'espace sépare.
 */
export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  actions,
  footer,
  children,
  i = 0,
  className = '',
  bodyClassName = '',
  id,
}) => {
  const autoId = useId()
  const headingId = id ?? autoId
  return (
    <section
      className={`panel reveal flex min-w-0 flex-col ${className}`}
      style={{ '--i': i } as React.CSSProperties}
      aria-labelledby={headingId}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pb-1 pt-5 sm:flex-nowrap">
        <div className="min-w-[min(100%,14rem)] flex-1">
          <h2 id={headingId} className="text-[0.9375rem] font-semibold leading-6 tracking-[-0.01em] text-fg">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>}
        </div>
        {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pb-4 pt-1 text-2xs text-muted">
          {footer}
        </footer>
      )}
    </section>
  )
}

export type SwatchKind = 'solid' | 'rest' | 'dashed' | 'line' | 'dashline'

/** Élément de légende : la nature du trait dit ce qu'il représente. */
export const LegendItem: React.FC<{ kind?: SwatchKind; className?: string; children: React.ReactNode }> = ({
  kind = 'solid',
  className = 'bg-viz-base',
  children,
}) => {
  const swatch =
    kind === 'rest' ? (
      <span className="h-2.5 w-2.5 rounded-full bg-track ring-1 ring-inset ring-line-strong" />
    ) : kind === 'dashed' ? (
      <span className="h-2.5 w-2.5 rounded-full border border-dashed border-subtle" />
    ) : kind === 'line' ? (
      <span className={`h-0.5 w-4 rounded-full ${className}`} />
    ) : kind === 'dashline' ? (
      <span className="w-4 border-t-2 border-dashed border-subtle" />
    ) : (
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
    )
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="inline-flex">
        {swatch}
      </span>
      {children}
    </span>
  )
}

export const Legend: React.FC<{ children: React.ReactNode; className?: string; label?: string }> = ({
  children,
  className = '',
  label = 'Légende',
}) => (
  <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted ${className}`} aria-label={label}>
    {children}
  </div>
)

/**
 * État vide : dit clairement ce qui manque et, si possible, pourquoi.
 * Jamais un zéro qui passerait pour une mesure.
 */
export const EmptyNote: React.FC<{
  title: string
  hint?: React.ReactNode
  tone?: 'neutral' | 'calm'
  className?: string
}> = ({ title, hint, tone = 'neutral', className = '' }) => (
  <div className={`flex flex-col items-center justify-center px-6 py-9 text-center ${className}`}>
    <span
      aria-hidden="true"
      className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${tone === 'calm' ? 'bg-ok/10' : 'bg-sunken'}`}
    >
      <span className={`h-2 w-2 rounded-full ${tone === 'calm' ? 'bg-ok' : 'bg-line-strong'}`} />
    </span>
    <p className="text-sm font-medium text-fg">{title}</p>
    {hint && <p className="mt-1 max-w-sm text-xs text-subtle">{hint}</p>}
  </div>
)
