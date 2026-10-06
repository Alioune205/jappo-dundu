import React from 'react'

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  /** Actions principales de la page, alignées à droite. */
  actions?: React.ReactNode
  className?: string
}

/** En-tête commun des modules : titre, contexte, actions. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, className = '' }) => (
  <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4 ${className}`}>
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold text-fg">{title}</h1>
      <div aria-hidden="true" className="tricolor mt-2 h-1 w-14 rounded-full" />
      {description && <p className="mt-2 text-sm text-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
)
