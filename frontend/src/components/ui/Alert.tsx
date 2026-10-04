import React from 'react'
import { TONE_DOT, TONE_TEXT, type Tone } from '@/lib/constants'

interface AlertProps {
  tone?: Tone
  title?: string
  children: React.ReactNode
  onClose?: () => void
  className?: string
}

/**
 * Bandeau de message : surface neutre, liseré gauche à la couleur du sens.
 * Pas de fond teinté — la couleur reste un signal, pas une décoration.
 */
export const Alert: React.FC<AlertProps> = ({
  tone = 'info',
  title,
  children,
  onClose,
  className = '',
}) => {
  const urgent = tone === 'danger' || tone === 'brand' || tone === 'warning'

  return (
    <div
      role={urgent ? 'alert' : 'status'}
      className={`relative flex items-start gap-3 overflow-hidden rounded border border-line bg-surface py-2.5 pl-4 pr-3 text-xs text-fg ${className}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-0.5 ${TONE_DOT[tone]}`} />

      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <p className={`mb-0.5 text-sm font-medium ${TONE_TEXT[tone]}`}>{title}</p>}
        <div className="text-muted">{children}</div>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="-m-1 rounded p-1 text-subtle transition-colors hover:bg-raised hover:text-fg"
          aria-label="Fermer le message"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
