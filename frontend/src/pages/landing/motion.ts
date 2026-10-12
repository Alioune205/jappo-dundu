/**
 * Motion design de la page d'accueil (sans dépendance).
 *
 * - Le contenu est visible par défaut : les états « cachés avant apparition »
 *   ne s'appliquent que sous `.landing[data-motion='on']`, posé avant le
 *   premier affichage quand le navigateur sait animer proprement
 *   (IntersectionObserver) et que l'utilisateur n'a pas demandé à réduire les
 *   animations. Sans JS, en test ou en mouvement réduit : page statique.
 * - `[data-reveal]` : apparition au défilement (une seule fois) ; le décalage
 *   d'un élément dans sa série passe par la variable CSS `--i`.
 * - `[data-count]` : compteur animé de 0 à sa valeur à l'apparition.
 */
import { useLayoutEffect, type RefObject } from 'react'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const COUNT_DURATION_MS = 1200

export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') return false
  return !window.matchMedia?.(REDUCED_MOTION).matches
}

/** Décélération forte : le compteur ralentit en approchant de sa valeur. */
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count)
  if (!Number.isFinite(target)) return
  const start = performance.now()
  const tick = (now: number) => {
    const progress = Math.min((now - start) / COUNT_DURATION_MS, 1)
    el.textContent = String(Math.round(target * easeOutExpo(progress)))
    if (progress < 1) requestAnimationFrame(tick)
  }
  el.textContent = '0'
  requestAnimationFrame(tick)
}

export function useLandingMotion(rootRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !motionAllowed()) return

    root.dataset.motion = 'on'
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const el = entry.target as HTMLElement
          el.dataset.revealed = 'true'
          el.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp)
          observer.unobserve(el)
        }
      },
      // Déclenche un peu avant que l'élément soit pleinement entré.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.15 }
    )
    root.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el))

    // Ombre de la navigation dès qu'on quitte le haut de page.
    const onScroll = () => {
      root.dataset.scrolled = String(window.scrollY > 24)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      delete root.dataset.motion
      delete root.dataset.scrolled
    }
  }, [rootRef])
}
