import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { URGENCIES } from '@/lib/constants'
import type { TriageAnswers, TriageAssessment, TriageProtocol } from '@/types/api'

interface TriageQuestionsProps {
  protocol: TriageProtocol | undefined
  answers: TriageAnswers
  onChange: (answers: TriageAnswers) => void
  assessment: TriageAssessment | undefined
}

/**
 * Questions clés posées à chaque appel, dans le même ordre ; un clic par
 * réponse. La priorité suggérée s'affiche au fur et à mesure.
 */
export const TriageQuestions: React.FC<TriageQuestionsProps> = ({ protocol, answers, onChange, assessment }) => {
  if (!protocol) return null
  const suggested = assessment && URGENCIES.find((u) => u.value === assessment.priority)
  return (
    <fieldset className="space-y-2.5 rounded-lg border border-line p-3">
      <legend className="eyebrow px-1">Tri de l’appel</legend>
      {protocol.questions.map((question) => (
        <div key={question.code} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-0 flex-1 basis-56 text-xs text-fg">{question.label}</span>
          <span className="flex flex-wrap gap-1" role="radiogroup" aria-label={question.label}>
            {question.choices.map((choice) => {
              const selected = answers[question.code] === choice.value
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    const next = { ...answers }
                    if (selected) delete next[question.code]
                    else next[question.code] = choice.value
                    onChange(next)
                  }}
                  className={`cursor-pointer rounded-md border px-2 py-1 text-2xs font-medium transition-colors ${
                    selected
                      ? 'border-brand bg-brand text-on-brand'
                      : 'border-line text-muted hover:border-fg/30 hover:text-fg'
                  }`}
                >
                  {choice.label}
                </button>
              )
            })}
          </span>
        </div>
      ))}
      {suggested && (
        <p className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5 text-xs text-muted">
          Priorité suggérée
          <Badge tone={suggested.tone} size="sm">
            {suggested.label}
          </Badge>
          {assessment.reasons.length > 0 && <span>· {assessment.reasons.join(', ')}</span>}
        </p>
      )}
      <p className="text-2xs text-subtle">{protocol.disclaimer}</p>
    </fieldset>
  )
}
