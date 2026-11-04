import React from 'react'

interface MissionStepsProps {
  step: number
  labels: string[]
  /** Retard : la progression passe au rouge. */
  late?: boolean
  /** Texte de droite (heure, arrivée estimée). */
  aside?: React.ReactNode
}

/**
 * Progression d'une mission : un segment par étape, l'étape en cours bat
 * doucement. L'étape est écrite en toutes lettres (la couleur ne suffit pas).
 */
export const MissionSteps: React.FC<MissionStepsProps> = ({ step, labels, late = false, aside }) => (
  <div>
    <ol className="grid gap-1" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-label={`Étape : ${labels[step]}`}>
      {labels.map((label, i) => (
        <li
          key={label}
          className={`h-1.5 rounded-full transition-colors duration-500 ${
            i < step ? (late ? 'bg-critical/70' : 'bg-viz-base') : i === step ? (late ? 'bg-critical' : 'bg-viz-base') : 'bg-track'
          } ${i === step ? 'live-pulse' : ''}`}
        />
      ))}
    </ol>
    <p className="mt-1.5 flex items-center justify-between gap-3 text-2xs text-muted">
      <span className={`font-semibold ${late ? 'text-critical' : 'text-fg'}`}>{labels[step]}</span>
      {aside && <span className="inline-flex items-center gap-1">{aside}</span>}
    </p>
  </div>
)
