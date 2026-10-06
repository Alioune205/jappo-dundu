import { useEffect, useState } from 'react'

/** Heure courante, rafraîchie à intervalle régulier (libellés « il y a 3 min »). */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
