import React from 'react'

/**
 * Emblème de Jappo IA : un anneau (le réseau qui relie) traversé par le
 * pouls rouge du logo. Les deux traits se dessinent à l'ouverture de
 * l'assistant ; pendant une recherche, le pouls défile dans l'anneau.
 */
export const JappoEmblem: React.FC<{ className?: string; pulseClassName?: string }> = ({
  className = 'h-6 w-6',
  pulseClassName = 'text-signal',
}) => (
  <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
    <g className="ai-emblem-core" style={{ transformOrigin: '24px 24px' }}>
      <circle
        className="ai-emblem-ring"
        cx="24"
        cy="24"
        r="18.5"
        stroke="currentColor"
        strokeWidth="2.75"
        pathLength={100}
        strokeDasharray="100"
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <path
        className={`ai-emblem-pulse ${pulseClassName}`}
        d="M9 25.5h8l3.4-8.5 4.6 15.5 3.6-11 2.4 4H39"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        strokeDasharray="100"
      />
    </g>
  </svg>
)
