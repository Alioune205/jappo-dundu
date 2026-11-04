import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/**
 * Vrai si l'utilisateur réduit les animations. Un environnement qui ne sait
 * pas répondre (tests, très vieux navigateurs) est traité comme « réduit » :
 * les valeurs finales s'affichent directement.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia !== 'function' || window.matchMedia(QUERY).matches,
    () => true
  )
}
