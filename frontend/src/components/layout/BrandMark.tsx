import React, { useId } from 'react'

interface BrandMarkProps {
  className?: string
}

/** Emblème Jappo Dundu : goutte de sang marquée d'une croix. Décoratif, le nom figure à côté. */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'h-9 w-9' }) => {
  const gradient = useId()
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x1="8" y1="3" x2="24" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f87171" />
          <stop offset="1" stopColor="#b71c1c" />
        </linearGradient>
      </defs>
      <path d="M16 2.5c5.2 6.6 10 12.4 10 18a10 10 0 0 1-20 0c0-5.6 4.8-11.4 10-18z" fill={`url(#${gradient})`} />
      <path d="M14.5 15h3v3.5H21v3h-3.5V25h-3v-3.5H11v-3h3.5z" fill="#ffffff" />
    </svg>
  )
}

/** Nom de l'application : « Jappo » foncé, « Dundu » rouge. */
export const BrandName: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`font-bold tracking-tight ${className}`}>
    <span className="text-fg">Jappo</span>
    <span className="text-brand">Dundu</span>
  </span>
)
