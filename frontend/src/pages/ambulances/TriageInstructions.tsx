import React from 'react'
import type { TriageProtocol } from '@/types/api'

/** Consignes à lire à l'appelant, dans l'ordre (massage cardiaque d'abord s'il le faut). */
export const TriageInstructions: React.FC<{ codes: string[]; protocol: TriageProtocol | undefined }> = ({
  codes,
  protocol,
}) => {
  const items = codes.map((code) => protocol?.instructions[code]).filter((item) => item !== undefined)
  if (items.length === 0) return null
  return (
    <div className="space-y-2" aria-label="Consignes à donner à l’appelant">
      <p className="eyebrow">À lire à l’appelant</p>
      <ol className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.code}
            className={`rounded-lg border px-3 py-2 ${index === 0 && item.code !== 'stay_safe' ? 'border-critical/40 bg-critical/5' : 'border-line'}`}
          >
            <p className="text-xs font-semibold text-fg">{item.title}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted">
              {item.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
