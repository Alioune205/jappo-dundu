import React from 'react'

interface PageHeaderProps {
  title: string
  /** Surtitre : module, périmètre (« Jappo Sang · Région de Dakar »). */
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  /** Actions principales de la page, alignées à droite. */
  actions?: React.ReactNode
  className?: string
}

/** En-tête commun des modules : surtitre, titre, contexte, actions. */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, eyebrow, description, actions, className = '' }) => (
  <div className={`reveal flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className="kicker mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">{eyebrow}</p>}
      <h1 className="text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.025em] text-fg sm:text-[2.125rem]">
        {title}
      </h1>
      {description && <p className="mt-1.5 text-[0.9375rem] text-muted">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
)
