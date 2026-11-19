import React from 'react'
import { JappoEmblem } from './JappoEmblem'
import { useAssistant } from './useAssistant'

/** Raccourci affiché selon le système (⌘ sur Mac). */
const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

/**
 * Pastille de Jappo IA : un petit rond d'encre en bas à droite, toujours
 * visible, qui ouvre l'assistant. Elle disparaît tant que la fenêtre est
 * ouverte (la fenêtre prend sa place).
 */
export const AssistantLauncher: React.FC = () => {
  const assistant = useAssistant()
  if (assistant.isOpen) return null
  return (
    <button
      type="button"
      onClick={assistant.open}
      aria-haspopup="dialog"
      aria-label="Ouvrir Jappo IA (assistant)"
      title={`Jappo IA (${SHORTCUT})`}
      className="fixed bottom-4 right-4 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-ink text-on-ink shadow-[var(--shadow-ink)] ring-1 ring-white/10 transition-[scale,background-color] duration-200 hover:scale-105 hover:bg-ink-raised active:scale-95 print:hidden"
    >
      <JappoEmblem className="h-6 w-6 text-on-ink" pulseClassName="text-critical-on-ink" />
    </button>
  )
}
