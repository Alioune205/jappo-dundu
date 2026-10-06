import React from 'react'

interface LogoProps {
  className?: string
}

/**
 * Symbole Jappo Dundu (cœur, goutte de sang, pouls, main). Deux fichiers :
 * le bleu marine du logo devient clair en thème sombre pour rester lisible.
 * Décoratif : le nom figure toujours à côté.
 */
export const BrandMark: React.FC<LogoProps> = ({ className = 'h-9 w-9' }) => (
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
export const BrandName: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`font-bold tracking-tight ${className}`}>
    <span className="text-fg">Jappo</span> <span className="text-brand">Dundu</span>
  </span>
)
