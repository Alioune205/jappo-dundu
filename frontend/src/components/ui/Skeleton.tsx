import React from 'react'

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 dark:bg-slate-800 ${className}`}
    />
  )
}

interface EmptyStateProps {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className = '',
}) => {
  return (
    <div
      className={`clinical-card p-12 text-center flex flex-col items-center justify-center border-dashed ${className}`}
    >
      {icon ? (
        <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-muted)] mb-4">
          {icon}
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-[var(--bg-subtle)] text-[var(--text-muted)] mb-4">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
      )}
      <h4 className="text-base font-semibold text-[var(--text-main)]">{title}</h4>
      {description && (
        <p className="text-xs text-[var(--text-muted)] max-w-sm mt-1">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
