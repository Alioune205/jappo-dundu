import React from 'react'

interface BrandMarkProps {
  className?: string
}

/**
 * Emblème Jappo Dundu : croix médicale blanche sur vert national, étoile
 * dorée en rappel du drapeau. Décoratif : le nom figure toujours à côté.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'h-9 w-9' }) => (
  <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="var(--brand)" />
    <rect x="16" y="8" width="8" height="24" rx="2" fill="#ffffff" />
    <rect x="8" y="16" width="24" height="8" rx="2" fill="#ffffff" />
    <path
      d="M32 4.5l1.18 2.6 2.82.3-2.1 1.9.6 2.8L32 10.7l-2.5 1.4.6-2.8-2.1-1.9 2.82-.3z"
      fill="var(--gold)"
    />
  </svg>
)
