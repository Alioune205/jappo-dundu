import React from 'react'
import { Link } from 'react-router'
import { ArrowRight, Maximize2, Minimize2 } from 'lucide-react'

interface HeroBannerProps {
  /** Prénom ou nom affiché dans la salutation. */
  name: string
  /** Titre de la page (h1), lu par les lecteurs d'écran et les tests. */
  title: string
  /** Ligne d'état : périmètre et fraîcheur des données. */
  status: React.ReactNode
  /** Lien vers le rapport de pilotage (version complète uniquement). */
  reportHref?: string
  crisisMode: boolean
  onToggleCrisis: () => void
}

/**
 * Bandeau d'accueil du tableau de bord réseau : salutation, nom du service et
 * promesse, sur une photo de l'activité transfusionnelle. La photo est un
 * décor (alt vide) ; tout le texte utile reste lisible sur le dégradé d'encre.
 */
export const HeroBanner: React.FC<HeroBannerProps> = ({
  name,
  title,
  status,
  reportHref,
  crisisMode,
  onToggleCrisis,
}) => (
  <section className="hero-banner reveal relative isolate overflow-hidden rounded-[1.25rem] text-white" aria-labelledby="hero-title">
    <picture>
      <source srcSet="/images/landing/hero-blood-donation.webp" type="image/webp" />
      <img
        src="/images/landing/hero-blood-donation.jpg"
        alt=""
        aria-hidden="true"
        className="hero-banner-photo absolute inset-0 -z-20 h-full w-full object-cover object-[72%_22%]"
      />
    </picture>
    {/* Dégradé d'encre : le texte reste lisible quelle que soit la photo. */}
    <div aria-hidden="true" className="hero-banner-veil absolute inset-0 -z-10" />

    <div className="flex min-h-[15rem] flex-col justify-center gap-4 px-6 py-8 sm:px-10 lg:min-h-[16.5rem] lg:max-w-[46rem]">
      <p className="text-base font-semibold text-white/90 sm:text-lg">
        Bonjour, {name} <span aria-hidden="true">👋</span>
      </p>
      <div>
        <p className="text-[2.25rem] font-extrabold leading-none tracking-[-0.035em] sm:text-[3rem]">
          Jappo <span className="text-[#ff5a64]">Dundu</span>
        </p>
        <p className="mt-3 border-l-[3px] border-[#4d8dff] pl-3 text-base leading-snug text-white/90 sm:text-lg">
          <span className="font-semibold text-[#8fb8ff]">Une coordination intelligente</span>
          <br />
          pour une santé plus forte au Sénégal.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {reportHref && (
          <Link
            to={reportHref}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 text-sm font-semibold backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            Voir le rapport global <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggleCrisis}
          aria-pressed={crisisMode}
          title="Plein écran pour un écran mural de salle de crise"
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#0b1d4a] transition-colors hover:bg-white/90"
        >
          {crisisMode ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
          {crisisMode ? 'Quitter le plein écran' : 'Salle de crise'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/75">
        <h1 id="hero-title" className="font-semibold text-white">
          {title}
        </h1>
        <span aria-hidden="true">·</span>
        {status}
      </div>
    </div>
  </section>
)
