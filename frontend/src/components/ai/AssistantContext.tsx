import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { JappoAIAssistant } from './JappoAIAssistant'
import { AssistantContext } from './useAssistant'

/**
 * Jappo IA accessible de partout : la carte de la barre latérale, le
 * raccourci Ctrl K (⌘ K sur Mac), ou tout composant qui appelle `open()`.
 * Le panneau reste monté : la conversation survit à sa fermeture.
 */
export const AssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const value = useMemo(() => ({ isOpen, open, toggle }), [isOpen, open, toggle])
  return (
    <AssistantContext.Provider value={value}>
      {children}
      <JappoAIAssistant isOpen={isOpen} onClose={close} />
    </AssistantContext.Provider>
  )
}
