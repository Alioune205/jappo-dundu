import React from 'react'

interface LogoProps {
  className?: string
  /** Sur fond bleu nuit (barre latérale) : la version claire, quel que soit le thème. */
  onDark?: boolean
}

/**
 * Symbole Jappo Dundu (cœur, goutte de sang, pouls, main). Deux fichiers :
 * le bleu marine du logo devient clair en thème sombre pour rester lisible.
 * Décoratif : le nom figure toujours à côté.
 */
export const BrandMark: React.FC<LogoProps> = ({ className = 'h-9 w-9', onDark = false }) =>
  onDark ? (
    <img src="/logo-mark-dark.png" alt="" aria-hidden="true" className={`${className} object-contain`} />
  ) : (
    <>
      <img src="/logo-mark.png" alt="" aria-hidden="true" className={`${className} object-contain dark:hidden`} />
      <img src="/logo-mark-dark.png" alt="" aria-hidden="true" className={`${className} hidden object-contain dark:block`} />
    </>
  )

/** Logo complet : symbole, nom et devise « Connecter • Sauver • Vivre ». */
export const BrandLogo: React.FC<LogoProps> = ({ className = 'h-40 w-auto' }) => (
  <>
    <img
      src="/logo.png"
      alt="Jappo Dundu — Connecter, sauver, vivre"
      className={`${className} object-contain dark:hidden`}
    />
    <img
      src="/logo-dark.png"
      alt="Jappo Dundu — Connecter, sauver, vivre"
      className={`${className} hidden object-contain dark:block`}
    />
  </>
)

/** Nom de l'application aux couleurs du logo : « Jappo » marine, « Dundu » rouge. */
export const BrandName: React.FC<{ className?: string; onDark?: boolean }> = ({ className = '', onDark = false }) => (
  <span className={`font-bold tracking-tight ${className}`}>
    <span className={onDark ? 'text-white' : 'text-fg'}>Jappo</span>{' '}
    {/* Sur bleu nuit, le rouge du logo est éclairci pour rester lisible. */}
    <span className={onDark ? 'text-[#ff5a64]' : 'text-signal'}>Dundu</span>
  </span>
)
