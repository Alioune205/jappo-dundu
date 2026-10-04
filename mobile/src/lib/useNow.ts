import { useEffect, useState } from 'react'

/** Horloge pour les libellés relatifs (« il y a 3 min ») : un rendu par intervalle, pas plus. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}
