import React from 'react'
import type { Tone } from '@/lib/constants'

interface AlertProps {
  tone?: Tone
  title?: string
  children: React.ReactNode
  onClose?: () => void
  className?: string
}

const TONE_CLASSES: Record<Tone, { border: string; bg: string; text: string; icon: string }> = {
  neutral: {
    border: 'border-white/10',
    bg: 'bg-ink-800/80',
    text: 'text-ink-200',
    icon: 'text-ink-400',
  },
  brand: {
    border: 'border-brand-500/30',
    bg: 'bg-brand-500/10',
    text: 'text-brand-200',
    icon: 'text-brand-400',
  },
  danger: {
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/10',
    text: 'text-rose-200',
    icon: 'text-rose-400',
  },
  warning: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    text: 'text-amber-200',
    icon: 'text-amber-400',
  },
  success: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-200',
    icon: 'text-emerald-400',
  },
  info: {
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
    text: 'text-sky-200',
    icon: 'text-sky-400',
  },
  violet: {
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/10',
    text: 'text-violet-200',
    icon: 'text-violet-400',
  },
}

export const Alert: React.FC<AlertProps> = ({
  tone = 'info',
  title,
  children,
  onClose,
  className = '',
}) => {
  const styles = TONE_CLASSES[tone]

  return (
    <div
      role="alert"
      className={`flex items-start gap-3.5 p-4 rounded-xl border backdrop-blur-md ${styles.border} ${styles.bg} ${styles.text} ${className}`}
    >
      <div className={`shrink-0 mt-0.5 ${styles.icon}`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <div className="flex-1 text-xs leading-relaxed">
        {title && <h4 className="font-semibold text-sm mb-0.5 text-ink-100">{title}</h4>}
        <div>{children}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="text-ink-400 hover:text-white transition-colors p-1"
          aria-label="Fermer l'alerte"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
