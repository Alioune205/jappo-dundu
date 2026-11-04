import { createContext, useContext } from 'react'

export interface AssistantContextType {
  isOpen: boolean
  open: () => void
  toggle: () => void
}

export const AssistantContext = createContext<AssistantContextType | undefined>(undefined)

/** Ouvre Jappo IA depuis n'importe quel composant de l'application. */
export const useAssistant = (): AssistantContextType => {
  const context = useContext(AssistantContext)
  if (!context) throw new Error('useAssistant must be used within an AssistantProvider')
  return context
}
