import { useEffect, useState } from 'react'

/** Minutes sans activité avant déconnexion (postes partagés des hôpitaux). */
export const IDLE_MINUTES = Number(import.meta.env.VITE_IDLE_MINUTES) || 60
/** Avertissement affiché avant la déconnexion. */
const WARNING_MS = 2 * 60_000
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Déconnecte une session restée sans activité : un poste partagé ne doit pas
 * laisser l'espace d'un soignant ouvert. Retourne true pendant les deux
 * dernières minutes (avertissement) ; une action de l'utilisateur relance le délai.
 */
export function useIdleLogout(onIdle: () => void, enabled = true) {
  const [warning, setWarning] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const limit = IDLE_MINUTES * 60_000
    let last = Date.now()
    const touch = () => {
      last = Date.now()
      setWarning(false)
    }
    const timer = window.setInterval(() => {
      const idle = Date.now() - last
      if (idle >= limit) {
        window.clearInterval(timer)
        onIdle()
      } else {
        setWarning(idle >= limit - WARNING_MS)
      }
    }, 15_000)
    EVENTS.forEach((name) => window.addEventListener(name, touch, { passive: true }))
    return () => {
      window.clearInterval(timer)
      EVENTS.forEach((name) => window.removeEventListener(name, touch))
    }
  }, [onIdle, enabled])

  return warning
}
