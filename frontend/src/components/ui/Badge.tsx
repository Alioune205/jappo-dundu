import React from 'react'
import type { Tone } from '@/lib/constants'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
  size?: 'sm' | 'md'
  dot?: boolean
  children: React.ReactNode
}

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-ink-800 text-ink-300 border-white/10',
  brand: 'bg-brand-600/15 text-brand-300 border-brand-500/30',
  danger: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  warning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
}

const DOT_CLASSES: Record<Tone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-400',
  danger: 'bg-rose-400',
  warning: 'bg-amber-400',
  success: 'bg-emerald-400',
  info: 'bg-sky-400',
  violet: 'bg-violet-400',
}

export const Badge: React.FC<BadgeProps> = ({
  tone = 'neutral',
  size = 'md',
  dot = false,
  className = '',
  children,
  ...props
}) => {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${TONE_CLASSES[tone]} ${sizeClass} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${DOT_CLASSES[tone]}`} />}
      {children}
    </span>
  )
}
