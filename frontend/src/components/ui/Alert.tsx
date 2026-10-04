import React from 'react'
import type { Tone } from '@/lib/constants'

interface AlertProps {
  tone?: Tone
  title?: string
  children: React.ReactNode
  onClose?: () => void
  className?: string
}

const TONE_CLASSES: Record<Tone, { border: string; bg: string; text: string; icon: string; title: string }> = {
  neutral: {
    border: 'border-slate-200 dark:border-slate-700',
    bg: 'bg-slate-50 dark:bg-slate-800/60',
    text: 'text-slate-700 dark:text-slate-300',
    title: 'text-slate-900 dark:text-white',
    icon: 'text-slate-500 dark:text-slate-400',
  },
  brand: {
    border: 'border-rose-200 dark:border-rose-900/60',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-800 dark:text-rose-200',
    title: 'text-rose-950 dark:text-rose-100',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  danger: {
    border: 'border-rose-200 dark:border-rose-900/60',
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-800 dark:text-rose-200',
    title: 'text-rose-950 dark:text-rose-100',
    icon: 'text-rose-600 dark:text-rose-400',
  },
  warning: {
    border: 'border-amber-200 dark:border-amber-900/60',
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-200',
    title: 'text-amber-950 dark:text-amber-100',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  success: {
    border: 'border-emerald-200 dark:border-emerald-900/60',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-800 dark:text-emerald-200',
    title: 'text-emerald-950 dark:text-emerald-100',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
  info: {
    border: 'border-sky-200 dark:border-sky-900/60',
    bg: 'bg-sky-50 dark:bg-sky-950/40',
    text: 'text-sky-800 dark:text-sky-200',
    title: 'text-sky-950 dark:text-sky-100',
    icon: 'text-sky-600 dark:text-sky-400',
  },
  violet: {
    border: 'border-indigo-200 dark:border-indigo-900/60',
    bg: 'bg-indigo-50 dark:bg-indigo-950/40',
    text: 'text-indigo-800 dark:text-indigo-200',
    title: 'text-indigo-950 dark:text-indigo-100',
    icon: 'text-indigo-600 dark:text-indigo-400',
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
      className={`flex items-start gap-3.5 p-4 rounded-xl border ${styles.border} ${styles.bg} ${styles.text} ${className}`}
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
        {title && <h4 className={`font-semibold text-sm mb-0.5 ${styles.title}`}>{title}</h4>}
        <div>{children}</div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors p-1"
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
