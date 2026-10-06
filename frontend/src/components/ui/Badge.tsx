import React from 'react'
import { TONE_DOT, TONE_PILL, type Tone } from '@/lib/constants'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  size?: 'sm' | 'md'
  dot?: boolean
  children: React.ReactNode
}

/** Étiquette d'état : pastille teintée à la couleur du sens, point coloré. */
export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  size = 'md',
  dot = true,
  className = '',
  children,
  ...props
}) => {
  const sizeClass = size === 'sm' ? 'h-5 px-2 text-2xs' : 'h-6 px-2.5 text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ${TONE_PILL[tone]} ${sizeClass} ${className}`}
      {...props}
    >
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />}
      {children}
    </span>
  )
}
