import React, { useEffect, useRef, useState } from 'react'
import { formatNumber } from '@/lib/format'
import { useReducedMotion } from './useReducedMotion'

interface CountUpProps {
  value: number
  format?: (value: number) => string
  /** Durée du défilement, en millisecondes. */
  duration?: number
  className?: string
}

const easeOutQuart = (t: number) => 1 - (1 - t) ** 4

/**
 * Chiffre qui défile jusqu'à sa valeur : à l'arrivée sur l'écran, puis à
 * chaque mise à jour temps réel (il part alors de l'ancienne valeur et
 * « tombe » à sa place). Sans animation, la valeur finale s'affiche telle quelle.
 */
export const CountUp: React.FC<CountUpProps> = ({ value, format = formatNumber, duration = 900, className = '' }) => {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  const current = useRef(0)

  // Une valeur qui change après le premier rendu « tombe » à sa place.
  const [previous, setPrevious] = useState(value)
  const [ticks, setTicks] = useState(0)
  if (previous !== value) {
    setPrevious(value)
    setTicks((t) => t + 1)
  }

  useEffect(() => {
    if (reduced) return
    const from = current.current
    if (from === value) return
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const next = from + (value - from) * easeOutQuart(progress)
      current.current = progress < 1 ? next : value
      setShown(current.current)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, reduced, duration])

  const display = reduced ? value : Number.isInteger(value) ? Math.round(shown) : shown
  return (
    <span key={ticks} className={`num ${ticks > 0 && !reduced ? 'value-tick inline-block' : ''} ${className}`}>
      {format(display)}
    </span>
  )
}
