import { useEffect } from 'react'

/** Une saisie en cours (champ, liste, zone éditable) : les raccourcis ne s'appliquent pas. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)

/**
 * Raccourci clavier d'une page (régulateurs : ne jamais lâcher le clavier
 * pendant un appel). Ignoré pendant une saisie ou avec Ctrl / Alt / Cmd.
 */
export function useHotkey(key: string, action: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || isTyping(event.target)) return
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      event.preventDefault()
      action()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key, action, enabled])
}
