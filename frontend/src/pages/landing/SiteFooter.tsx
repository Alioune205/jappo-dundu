import React from 'react'
import { Link } from 'react-router'
import { ArrowRight, ArrowUp, ExternalLink, HeartHandshake, Phone, ShieldCheck } from 'lucide-react'
import { FULL_FEATURES } from '@/lib/features'
import { MODULES, SOURCE } from './content'

interface SiteFooterProps {
  /** Accès à la plateforme (connexion, ou espace si déjà connecté). */
  spaceLink: { to: string; label: string }
}

const linkClass = 'text-sm text-white/70 transition-colors hover:text-white'

/** Colonne de liens du pied de page. */
const Column: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <nav aria-label={title}>
    <h2 className="font-manrope text-sm font-extrabold tracking-[-0.01em] text-white">{title}</h2>
    <ul className="mt-4 space-y-2.5">{children}</ul>
  </nav>
)

/**
 * Pied de page de l'accueil : bandeau d'urgence (SAMU 1515, don de sang),
 * présentation et accès à la plateforme, liens par public, puis mentions.
 * Aucun contact inventé : seuls les numéros et sites publics réels figurent.
 */
export const SiteFooter: React.FC<SiteFooterProps> = ({ spaceLink }) => (
  <footer className="relative isolate overflow-hidden bg-[#020e23] text-white">
    {/* Halo et symbole en filigrane : décor. */}
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_10%_0%,rgb(37_99_235/0.18),transparent_70%),radial-gradient(40%_40%_at_95%_100%,rgb(242_11_43/0.14),transparent_70%)]"
    />
    <img
      src="/logo-mark-dark.png"
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute -right-16 bottom-10 -z-10 hidden h-80 w-80 opacity-[0.04] lg:block"
    />

    <div className="mx-auto max-w-[84rem] px-5 pt-14 lg:px-10">
      {/* Bandeau d'urgence : les deux gestes qui sauvent. */}
      <div className="grid gap-3 md:grid-cols-2">
        <a
          href="tel:1515"
          className="group flex items-center gap-4 rounded-2xl bg-gradient-to-r from-[#c8102e] to-[#f20b2b] p-5 shadow-[0_18px_40px_-18px_rgb(242_11_43/0.6)] transition-transform hover:-translate-y-0.5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-inset ring-white/25">
            <Phone className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/80">Urgence vitale</span>
            <span className="font-manrope block text-lg font-extrabold leading-tight">Appelez le SAMU : 1515</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </a>
        <a
          href="#don"
          className="group flex items-center gap-4 rounded-2xl bg-white/[0.06] p-5 ring-1 ring-inset ring-white/10 transition-[translate,background-color] hover:-translate-y-0.5 hover:bg-white/[0.09]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f20b2b]/15 text-[#ff5a6e] ring-1 ring-inset ring-[#f20b2b]/30">
            <HeartHandshake className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-white/60">Don de sang</span>
            <span className="font-manrope block text-lg font-extrabold leading-tight">Qui peut donner, et où ?</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-white/70 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </a>
      </div>

      {/* Présentation et liens. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 border-b border-white/10 py-14 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] lg:gap-8">
        <div className="col-span-2 lg:col-span-1 lg:pr-6">
          <a href="#accueil" className="inline-flex items-center gap-3">
            <img src="/logo-mark-dark.png" alt="" aria-hidden="true" className="h-12 w-12" />
            <span className="leading-tight">
              <strong className="font-manrope block text-xl font-extrabold tracking-[-0.03em]">
                Jappo <span className="text-[#ff314b]">Dundu</span>
              </strong>
              <small className="block text-xs text-white/70">Santé · Coordination · Solidarité</small>
            </span>
          </a>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/70">
            Le sang, les lits et les ambulances du Sénégal sur une seule plateforme : un lit libéré ou une ambulance
            disponible se voit partout, aussitôt.
          </p>
          <Link
            to={spaceLink.to}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[#031632] transition-colors hover:bg-white/90"
          >
            {spaceLink.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <Column title="Solutions">
          {MODULES.map((m) => (
            <li key={m.key}>
              <a href="#solutions" className={linkClass}>
                {m.name}
              </a>
            </li>
          ))}
          <li>
            <a href="#plateforme" className={linkClass}>
              La plateforme
            </a>
          </li>
        </Column>

        <Column title="Découvrir">
          <li>
            <a href="#fonctionnement" className={linkClass}>
              Fonctionnement
            </a>
          </li>
          <li>
            <a href="#vision" className={linkClass}>
              Notre vision
            </a>
          </li>
          <li>
            <a href="#faq" className={linkClass}>
              Questions fréquentes
            </a>
          </li>
        </Column>

        <Column title="Donneurs">
          <li>
            <a href="#don" className={linkClass}>
              Devenir donneur
            </a>
          </li>
          <li>
            <a href="#don" className={linkClass}>
              Conditions du don
            </a>
          </li>
          <li>
            <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-1.5`}>
              Site du CNTS <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(nouvel onglet)</span>
            </a>
          </li>
        </Column>

        <Column title="Professionnels">
          <li>
            <Link to="/login" className={linkClass}>
              Espace professionnel
            </Link>
          </li>
          {FULL_FEATURES && (
            <li>
              <Link to="/rejoindre" className={linkClass}>
                Rejoindre le réseau
              </Link>
            </li>
          )}
          <li>
            <span className="inline-flex items-center gap-1.5 text-sm text-white/70">
              <ShieldCheck className="h-3.5 w-3.5 text-[#6ee3a8]" aria-hidden="true" />
              Accès réservé et journalisé
            </span>
          </li>
        </Column>
      </div>

      {/* Mentions. */}
      <div className="flex flex-col gap-4 py-7 text-xs text-white/55 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-3xl leading-relaxed">
          © 2026 Jappo Dundu · Projet de fin d’études. Jappo Dundu n’est pas un service officiel du CNTS : les
          informations sur le don de sang viennent de{' '}
          <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">
            cnts.gouv.sn
          </a>
          {`, consulté le ${SOURCE.consulted}. Images d’illustration.`}
        </p>
        <a
          href="#accueil"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-full px-4 py-2 font-semibold text-white/80 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/10 hover:text-white lg:self-auto"
        >
          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> Retour en haut
        </a>
      </div>
    </div>
  </footer>
)
