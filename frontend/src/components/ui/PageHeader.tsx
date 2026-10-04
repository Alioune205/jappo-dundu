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
  <div className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-3 ${className}`}>
    <div className="min-w-0">
      <h1 className="text-lg font-semibold tracking-tight text-fg">{title}</h1>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
)
