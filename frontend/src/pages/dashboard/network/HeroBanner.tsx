import React from 'react'
import { Link } from 'react-router'
import { ArrowRight, Maximize2, Minimize2 } from 'lucide-react'

export interface Verdict {
  /** Libellé court (« 2 urgences vitales »). */
  label: string
  severity: 'critical' | 'warning'
  to: string
}

interface HeroBannerProps {
  /** Prénom ou nom affiché dans la salutation. */
  name: string
  /** Titre de la page (h1), lu par les lecteurs d'écran et les tests. */
  title: string
  /** Ligne d'état : périmètre et fraîcheur des données. */
  status: React.ReactNode
  /** Ce qui demande une action, déjà compté (vide : situation calme). */
  verdict: Verdict[]
  /** État des services, pour l'administrateur (une phrase). */
  system?: { ok: boolean; text: string } | null
  /** Lien vers le rapport de pilotage (version complète uniquement). */
  reportHref?: string
  crisisMode: boolean
  onToggleCrisis: () => void
}

/**
 * Bandeau du tableau de bord réseau (maquette de l'équipe : photo, encre bleu
 * nuit). Il ne promet rien : il dit la situation. Le titre, puis le verdict
 * compté à partir des données, puis l'heure de la dernière mise à jour.
 */
export const HeroBanner: React.FC<HeroBannerProps> = ({
  name,
  title,
  status,
  verdict,
  system,
  reportHref,
  crisisMode,
  onToggleCrisis,
}) => {
  const critical = verdict.some((v) => v.severity === 'critical')
  return (
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
      <div aria-hidden="true" className="hero-banner-veil absolute inset-0 -z-10" />

      <div className="flex min-h-[13.5rem] flex-col justify-between gap-5 px-6 py-6 sm:px-8 lg:max-w-[48rem]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-white/75">Bonjour, {name}</p>
        </div>

        <div>
          <h1 id="hero-title" className="text-[2rem] font-bold leading-none tracking-[-0.03em] sm:text-[2.5rem]">
            {title}
          </h1>
          {/* Verdict : chaque point mène à l'écran où agir. */}
          <div className="mt-4 flex flex-wrap items-center gap-2" aria-live="polite">
            {verdict.length === 0 ? (
              <span className="inline-flex h-8 items-center gap-2 rounded-full bg-white/10 px-3 text-sm font-medium ring-1 ring-inset ring-white/15">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok-on-ink" />
                Aucune situation ne requiert d’intervention
              </span>
            ) : (
              <>
                {verdict.map((v) => (
                  <Link
                    key={v.label}
                    to={v.to}
                    className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors ${
                      v.severity === 'critical'
                        ? 'bg-white text-[#a1150c] hover:bg-white/90'
                        : 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 rounded-full ${v.severity === 'critical' ? 'live-pulse bg-critical' : 'bg-warning-on-ink'}`}
                    />
                    {v.label}
                  </Link>
                ))}
                <span className="sr-only">{critical ? 'Situation critique en cours.' : 'Points de vigilance en cours.'}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/70">
            {status}
            {system && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${system.ok ? 'bg-ok-on-ink' : 'bg-warning-on-ink'}`} />
                  {system.text}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {reportHref && (
              <Link
                to={reportHref}
                className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-white/90 ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/10"
              >
                Rapport global <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <button
              type="button"
              onClick={onToggleCrisis}
              aria-pressed={crisisMode}
              title="Plein écran pour un écran mural de salle de crise"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white/10 px-3.5 text-sm font-semibold ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/20"
            >
              {crisisMode ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
              {crisisMode ? 'Quitter le plein écran' : 'Salle de crise'}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
