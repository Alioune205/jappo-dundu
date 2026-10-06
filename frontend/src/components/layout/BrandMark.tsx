import React from 'react'

interface BrandMarkProps {
  className?: string
}

/** Emblème Jappo Dundu : croix médicale. Décoratif, le nom figure toujours à côté. */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'h-8 w-8' }) => (
  <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--inverse-bg)" />
    <path d="M13.5 8h5v5.5H24v5h-5.5V24h-5v-5.5H8v-5h5.5z" fill="var(--inverse-fg)" />
    <circle cx="24" cy="8" r="3" fill="var(--critical)" stroke="var(--inverse-bg)" strokeWidth="1.5" />
  </svg>
)
