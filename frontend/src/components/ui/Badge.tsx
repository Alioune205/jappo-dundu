import React from 'react'
import { TONE_DOT, type Tone } from '@/lib/constants'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  size?: 'sm' | 'md'
  dot?: boolean
  children: React.ReactNode
}

/**
 * Étiquette d'état : texte neutre sur fond neutre, la couleur ne porte que le
 * point. Les états critiques gardent un texte coloré pour être repérés d'un coup d'œil.
 */
export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  size = 'md',
  dot = true,
  className = '',
  children,
  ...props
}) => {
  const sizeClass = size === 'sm' ? 'h-5 px-1.5 text-2xs' : 'h-6 px-2 text-xs'
  const textClass = tone === 'danger' || tone === 'brand' ? 'text-critical' : 'text-fg'

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-line bg-raised font-medium ${textClass} ${sizeClass} ${className}`}
      {...props}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />}
      {children}
    </span>
  )
}
