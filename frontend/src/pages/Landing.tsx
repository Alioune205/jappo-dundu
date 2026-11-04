import React, { useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  Ambulance,
  ArrowRight,
  BedDouble,
  BellRing,
  Cake,
  CalendarClock,
  Droplets,
  ExternalLink,
  Handshake,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Plus,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Weight,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { REGIONS } from '@/lib/constants'
import { BLOOD_NEEDS, DONOR_CONDITIONS, FAQ, MODULES, SCENARIO, SOURCE, type ModuleKey } from './landing/content'
import { useLandingMotion } from './landing/motion'
import { DonorAlertPhone, MissionCard, PlatformStage } from './landing/Mockups'
import { FULL_FEATURES } from '@/lib/features'
import { SiteFooter } from './landing/SiteFooter'

const NAV = [
  { href: '#accueil', label: 'Accueil' },
  { href: '#solutions', label: 'Nos solutions' },
  { href: '#fonctionnement', label: 'Fonctionnement' },
  { href: '#vision', label: 'Notre vision' },
  { href: '#don', label: 'Don de sang' },
  { href: '#faq', label: 'FAQ' },
]

/**
 * Chaque module : icône, voile de sa carte photo, couleur propre (frise du
 * fonctionnement) et teinte de ses pastilles.
 */
const MODULE_STYLE: Record<
  ModuleKey,
  { icon: React.ElementType; overlay: string; iconColor: string; hex: string; tint: string; photo: string; alt: string }
> = {
  blood: {
    icon: Droplets,
    overlay: 'bg-[linear-gradient(90deg,rgb(153_0_22/0.9),rgb(110_0_20/0.08))]',
    iconColor: 'text-[#f20b2b]',
    hex: '#f20b2b',
    tint: 'bg-[#fde9ec] text-[#c8102e]',
    photo: 'jappo-sang',
    alt: 'Une soignante contrôle une poche de sang',
  },
  beds: {
    icon: BedDouble,
    overlay: 'bg-[linear-gradient(90deg,rgb(0_37_92/0.9),rgb(0_37_92/0.08))]',
    iconColor: 'text-[#0871db]',
    hex: '#0871db',
    tint: 'bg-[#e6f0fc] text-[#0659b5]',
    photo: 'jappo-lits',
    alt: 'Une salle d’hospitalisation lumineuse, lits prêts à accueillir',
  },
  ambulances: {
    icon: Ambulance,
    overlay: 'bg-[linear-gradient(90deg,rgb(0_62_49/0.9),rgb(0_62_49/0.08))]',
    iconColor: 'text-[#0a9a6d]',
    hex: '#0a9a6d',
    tint: 'bg-[#e2f5ee] text-[#067a55]',
    photo: 'jappo-ambulances',
    alt: 'Une ambulance roule dans une avenue de Dakar',
  },
}

const PLATFORM_FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Un tableau de bord par rôle',
    text: 'Supervision nationale, banque de sang, lits ou SAMU : chacun voit son périmètre, rien de plus.',
  },
  {
    icon: BellRing,
    title: 'Les urgences d’abord',
    text: 'Services saturés, stocks sous le seuil et missions vitales remontent en tête.',
  },
  {
    icon: Sparkles,
    title: 'Jappo IA',
    text: 'Posez une question simple : l’assistant répond avec les chiffres de vos tableaux de bord et cite ses sources.',
  },
]

const BENEFITS = [
  { icon: Zap, title: 'Réactivité accrue', text: 'Lits, stocks et ambulances au même endroit : moins d’appels, moins d’attente.' },
  {
    icon: Handshake,
    title: 'Coordination renforcée',
    text: 'Hôpitaux, centres de transfusion et SAMU partagent la même information, au même moment.',
  },
  { icon: ShieldCheck, title: 'Sécurité des données', text: 'Chaque compte ne voit que son domaine ; les actions sensibles sont tracées.' },
  {
    icon: HeartPulse,
    title: 'Solidarité nationale',
    text: 'Les donneurs compatibles les plus proches sont alertés quand un hôpital a besoin d’eux.',
  },
]

/** Garanties de sécurité réellement en place dans la plateforme (voir backend/security). */
const SECURITY = [
  { icon: LockKeyhole, title: 'Accès par rôle', text: 'Chaque compte ne voit que son domaine et son établissement.' },
  {
    icon: KeyRound,
    title: 'Double authentification',
    text: 'Un code temporaire, généré par une application d’authentification, protège la connexion.',
  },
  {
    icon: ScrollText,
    title: 'Journal d’audit',
    text: 'Consultations de donneurs, accès d’urgence, changements de rôle : tout est tracé.',
  },
  { icon: ShieldCheck, title: 'Données patients protégées', text: 'Les donneurs ne reçoivent jamais d’information sur les patients.' },
]

const CONDITION_ICON: Record<(typeof DONOR_CONDITIONS)[number]['key'], React.ElementType> = {
  age: Cake,
  weight: Weight,
  men: CalendarClock,
  women: CalendarClock,
  health: Stethoscope,
}

const redButton =
  'btn inline-flex items-center justify-center gap-2 rounded-full bg-[#f20b2b] px-6 font-bold text-white transition-[translate,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgb(242_11_43/0.3)]'

/** Rang d'un élément dans sa série : décale son apparition (voir index.css). */
const stagger = (i: number) => ({ '--i': i }) as React.CSSProperties

/** Libellé de section : trait rouge et capitales. */
const Eyebrow: React.FC<{ children: React.ReactNode; light?: boolean }> = ({ children, light = false }) => (
  <span className={`flex items-center gap-3 text-xs font-extrabold uppercase tracking-[0.08em] ${light ? 'text-[#ff314b]' : 'text-[#071b43]'}`}>
    <span aria-hidden="true" className="h-[3px] w-6 bg-[#f20b2b]" />
    {children}
  </span>
)

const H2: React.FC<{ children: React.ReactNode; light?: boolean; className?: string }> = ({ children, light = false, className = '' }) => (
  <h2
    className={`font-manrope mt-3 text-balance text-[clamp(1.75rem,2.9vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.035em] ${light ? 'text-white' : 'text-[#071b43]'} ${className}`}
  >
    {children}
  </h2>
)

/** En-tête de section : le titre à gauche, sa mise en contexte à droite, derrière un filet. */
const SectionHead: React.FC<{ eyebrow: string; title: React.ReactNode; children: React.ReactNode }> = ({ eyebrow, title, children }) => (
  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-16">
    <div data-reveal>
      <Eyebrow>{eyebrow}</Eyebrow>
      <H2>{title}</H2>
    </div>
    <div data-reveal className="border-l border-[#aab6c9] py-1 pl-6 text-base leading-relaxed text-[#3d4a63]">
      {children}
    </div>
  </div>
)

/**
 * Photo : WebP, puis JPEG si le navigateur ou le fichier fait défaut. Sans
 * aucun fichier, un fond d'encre prend sa place : jamais d'image cassée.
 */
const Photo: React.FC<{ name: string; alt: string; className?: string; eager?: boolean }> = ({
  name,
  alt,
  className = '',
  eager = false,
}) => {
  const sources = [`/images/landing/${name}.webp`, `/images/landing/${name}.jpg`]
  const [attempt, setAttempt] = useState(0)
  if (attempt >= sources.length) {
    return <div role="img" aria-label={alt} className={`h-full w-full bg-[#031632] ${className}`} />
  }
  return (
    <img
      src={sources[attempt]}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setAttempt((n) => n + 1)}
      className={`h-full w-full object-cover ${className}`}
    />
  )
}

const Brand: React.FC<{ small?: boolean }> = ({ small = false }) => (
  <a href="#accueil" className="flex shrink-0 items-center gap-2.5 text-white">
    <img src="/logo-mark-dark.png" alt="" aria-hidden="true" className={small ? 'h-9 w-9' : 'h-11 w-11'} />
    <span className="leading-tight">
      <strong className={`font-manrope block font-extrabold tracking-[-0.03em] ${small ? 'text-base' : 'text-lg'}`}>
        Jappo <span className="text-[#ff314b]">Dundu</span>
      </strong>
      <small className="block text-[0.6875rem] text-white/80">Santé · Coordination · Solidarité</small>
    </span>
  </a>
)

/** Groupes en tension publiés par le CNTS (données réelles, datées). */
const BloodNeeds: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-[1.375rem] bg-white p-5 shadow-[0_24px_50px_rgb(3_22_50/0.16)] ring-1 ring-[#e8edf5] ${className}`}>
    <h3 id="groupes-recherches" className="font-manrope text-base font-extrabold">
      Groupes recherchés
    </h3>
    <p className="mt-0.5 text-xs text-[#738099]">Publiés par le CNTS · {BLOOD_NEEDS.updated}</p>
    <ul aria-labelledby="groupes-recherches" className="mt-3.5 grid grid-cols-4 gap-2">
      {BLOOD_NEEDS.groups.map((g) => {
        const critical = g.level === 'critical'
        return (
          <li key={g.group} className={`rounded-xl px-1 py-2.5 text-center ${critical ? 'bg-[#fde9ec]' : 'bg-[#f3f5fc]'}`}>
            <span className={`font-manrope block text-xl font-extrabold ${critical ? 'text-[#e0102f]' : 'text-[#071b43]'}`}>{g.group}</span>
            <span className={`mt-1 inline-flex items-center gap-1 text-[0.625rem] font-bold ${critical ? 'text-[#c8102e]' : 'text-[#64728a]'}`}>
              {critical && <span aria-hidden="true" className="heartbeat h-1.5 w-1.5 rounded-full bg-[#f20b2b]" />}
              {critical ? 'Critique' : 'En baisse'}
            </span>
          </li>
        )
      })}
    </ul>
  </div>
)

/**
 * Page d'accueil publique : hero sombre plein cadre, trois piliers, aperçu du
 * tableau de bord, fonctionnement, vision, sécurité, don de sang, FAQ.
 */
export const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  useLandingMotion(rootRef)
  const [menuOpen, setMenuOpen] = useState(false)
  const spaceLink = isAuthenticated
    ? { to: '/', label: 'Mon espace', short: 'Mon espace' }
    : { to: '/login', label: 'Accéder à la plateforme', short: 'Espace pro' }

  return (
    <div ref={rootRef} className="landing min-h-full overflow-x-hidden bg-[#f3f5fc] text-[#071b43]">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2"
      >
        Aller au contenu
      </a>

      {/* Navigation */}
      <header className="nav-dark fixed inset-x-0 top-0 z-40 border-b border-white/10 text-white">
        <nav aria-label="Navigation principale" className="mx-auto flex h-[4.5rem] max-w-[84rem] items-center justify-between gap-6 px-5 lg:px-10">
          <Brand />
          <ul className="hidden items-center gap-8 lg:flex">
            {NAV.map((item, k) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`relative py-3 text-sm font-bold transition-colors hover:text-white ${k === 0 ? 'text-white' : 'text-white/80'} ${
                    k === 0 ? 'after:absolute after:inset-x-0 after:bottom-1 after:h-0.5 after:bg-[#f20b2b]' : ''
                  }`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Link
              to={spaceLink.to}
              className="btn inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full bg-white px-5 text-sm font-extrabold text-[#031632] transition-colors hover:bg-white/90"
            >
              <span className="sm:hidden">{spaceLink.short}</span>
              <span className="hidden sm:inline">{spaceLink.label}</span>
              <ArrowRight className="btn-arrow h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white lg:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>
        {menuOpen && (
          <ul className="border-t border-white/10 bg-[#031632] px-5 py-4 lg:hidden">
            {NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-bold text-white/85">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </header>

      <main id="contenu">
        {/* HERO */}
        <section id="accueil" className="relative isolate overflow-hidden bg-[#031632] text-white">
          <div className="absolute inset-0 -z-10">
            <Photo
              name="hero-blood-donation"
              eager
              alt="Une infirmière contrôle une poche de sang avant transfusion"
              className="hero-photo object-[72%_30%]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgb(2_14_34/0.98)_0%,rgb(2_14_34/0.92)_30%,rgb(2_14_34/0.4)_56%,rgb(2_14_34/0.02)_100%),linear-gradient(0deg,rgb(2_14_34/0.3),transparent_45%)] max-lg:bg-[linear-gradient(90deg,rgb(2_14_34/0.96),rgb(2_14_34/0.75)_65%,rgb(2_14_34/0.25))]" />
          </div>

          <div className="mx-auto flex min-h-[min(44rem,100svh)] max-w-[84rem] items-center px-5 pb-28 pt-32 lg:px-10">
            <div className="max-w-[40rem]">
              <h1
                data-hero
                style={stagger(0)}
                className="font-manrope text-[clamp(2.5rem,5vw,4.4rem)] font-extrabold leading-[1.06] tracking-[-0.045em]"
              >
                Mieux coordonner
                <br />
                les ressources.
                <br />
                <span className="relative whitespace-nowrap text-[#f20b2b]">
                  Sauver des vies.
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 200 14"
                    preserveAspectRatio="none"
                    className="absolute -bottom-3 left-[55%] h-3.5 w-[45%]"
                  >
                    <path d="M2 10 C 60 2, 140 2, 198 8" fill="none" stroke="#f20b2b" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p data-hero style={stagger(1)} className="mt-8 max-w-md text-lg leading-relaxed text-[#f0f4fc]/90">
                Jappo Dundu relie le sang, les lits et les ambulances du Sénégal sur une seule plateforme, pour une
                meilleure coordination des ressources sanitaires au service de tous.
              </p>
              <div data-hero style={stagger(2)} className="mt-9 flex flex-wrap items-center gap-6">
                <a href="#solutions" className={`${redButton} h-13 text-[0.9375rem]`}>
                  Découvrir la plateforme <ArrowRight className="btn-arrow h-5 w-5" aria-hidden="true" />
                </a>
                <a href="#don" className="group flex items-center gap-3 text-[0.9375rem] font-bold">
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-white/80 transition-colors group-hover:bg-white/10">
                    <HeartPulse className="h-5 w-5" aria-hidden="true" />
                  </span>
                  Devenir donneur
                </a>
              </div>
            </div>
          </div>

          <svg aria-hidden="true" viewBox="0 0 1440 100" preserveAspectRatio="none" className="absolute -bottom-px left-0 z-10 h-16 w-full lg:h-24">
            <path d="M0,48 C180,105 330,75 510,45 C710,10 850,90 1030,55 C1210,20 1320,20 1440,0 L1440,100 L0,100Z" fill="#f3f5fc" />
          </svg>
        </section>

        {/* Écosystème : trois piliers */}
        <section id="solutions" className="scroll-mt-20 px-5 pb-24 pt-10 lg:px-10">
          <div className="mx-auto max-w-[84rem]">
            <SectionHead
              eyebrow="Notre écosystème"
              title={
                <>
                  Une plateforme, trois piliers
                  <br className="hidden sm:block" /> pour une santé mieux organisée.
                </>
              }
            >
              <p>
                Jappo Dundu réunit trois solutions complémentaires qui partagent les mêmes données : un lit libéré ou une
                ambulance disponible se voit partout, aussitôt.
              </p>
            </SectionHead>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {MODULES.map((module, index) => {
                const style = MODULE_STYLE[module.key]
                const Icon = style.icon
                return (
                  <article
                    key={module.key}
                    data-reveal
                    style={stagger(index)}
                    className="group relative isolate h-[17rem] overflow-hidden rounded-[1.375rem] text-white shadow-[0_8px_24px_rgb(7_24_57/0.14)]"
                  >
                    <Photo
                      name={style.photo}
                      alt={style.alt}
                      className="absolute inset-0 -z-20 transition-transform duration-500 group-hover:scale-[1.06]"
                    />
                    <div className={`absolute inset-0 -z-10 ${style.overlay}`} />
                    <div className="absolute bottom-6 left-6 right-6">
                      <span className={`mb-3 grid h-12 w-12 place-items-center rounded-full bg-white ${style.iconColor}`}>
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <h3 className="font-manrope text-2xl font-extrabold tracking-[-0.02em]">{module.name}</h3>
                      <p className="mb-3 mt-1.5 max-w-[16rem] text-sm leading-snug text-white/90">{module.tagline}</p>
                      <a href="#fonctionnement" className="inline-flex items-center gap-1.5 text-sm font-bold">
                        En savoir plus
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                      </a>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* Plateforme : le tableau de bord en scène */}
        <section id="plateforme" className="scroll-mt-20 px-5 pb-24 lg:px-10">
          <div className="mx-auto max-w-[84rem]">
            <SectionHead eyebrow="Une expérience unique" title="Une vision claire pour une santé plus performante.">
              <p>
                Un tableau de bord par rôle : lits, sang et missions SAMU se suivent en temps réel, et ce qui demande une
                intervention passe en premier.
              </p>
              <Link to={spaceLink.to} className={`${redButton} mt-5 h-11 text-sm`}>
                Explorer le tableau de bord <ArrowRight className="btn-arrow h-4 w-4" aria-hidden="true" />
              </Link>
            </SectionHead>

            <div className="mt-12">
              <PlatformStage />
            </div>

            <ul className="mt-12 grid gap-8 md:grid-cols-3 md:gap-10">
              {PLATFORM_FEATURES.map((feature, index) => (
                <li key={feature.title} data-reveal style={stagger(index)} className="border-t border-[#d5ddea] pt-6">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#031632] text-white">
                    <feature.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="font-manrope mt-4 text-lg font-extrabold">{feature.title}</h3>
                  <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-[#3d4a63]">{feature.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Fonctionnement : une urgence de bout en bout */}
        <section id="fonctionnement" className="scroll-mt-20 bg-white px-5 py-24 lg:px-10">
          <div className="mx-auto grid max-w-[84rem] gap-14 lg:grid-cols-2 lg:gap-20">
            <div>
              <div data-reveal>
                <Eyebrow>Fonctionnement</Eyebrow>
                <H2>Une urgence, du premier appel au don de sang.</H2>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-[#3d4a63]">
                  Quatre acteurs, une seule plateforme : chacun voit aussitôt ce que l’autre vient de faire.
                </p>
              </div>
              <ol data-reveal data-timeline className="mt-10">
                {SCENARIO.map((step, index) => {
                  const style = MODULE_STYLE[step.module]
                  const next = SCENARIO[index + 1]
                  const Icon = style.icon
                  return (
                    <li key={step.title} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-5 pb-9 last:pb-0">
                      {next && (
                        <span aria-hidden="true" className="absolute bottom-0 left-[1.375rem] top-11 w-0.5 -translate-x-1/2 bg-[#e6ebf3]">
                          <span
                            className="timeline-fill-y absolute inset-0"
                            style={{
                              backgroundImage: `linear-gradient(${style.hex}, ${MODULE_STYLE[next.module].hex})`,
                              ...stagger(index),
                            }}
                          />
                        </span>
                      )}
                      <span className={`grid h-11 w-11 place-items-center rounded-full ${style.tint}`}>
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="pt-0.5">
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-mono text-[0.8125rem] font-semibold">T + {step.time}</span>
                          <span className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-bold ${style.tint}`}>
                            {MODULES.find((m) => m.key === step.module)?.name}
                          </span>
                        </p>
                        <h3 className="font-manrope mt-1.5 text-lg font-extrabold leading-snug">{step.title}</h3>
                        <p className="mt-1 max-w-md text-[0.9375rem] leading-relaxed text-[#3d4a63]">{step.text}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
              <p className="mt-8 pl-16 text-xs text-[#738099]">Scénario type : les temps sont indicatifs.</p>
            </div>

            <figure data-reveal className="relative isolate min-h-[30rem] overflow-hidden rounded-[1.75rem] bg-[#031632]">
              <Photo
                name="urgence"
                alt="Une régulatrice du SAMU suit les interventions depuis la salle de régulation"
                className="absolute inset-0 object-[72%_center]"
              />
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgb(2_14_34/0)_40%,rgb(2_14_34/0.8))]" />
              <MissionCard className="absolute inset-x-4 bottom-4 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[23rem]" />
            </figure>
          </div>
        </section>

        {/* Vision : pourquoi Jappo Dundu */}
        <section id="vision" className="scroll-mt-20 px-5 py-24 lg:px-10">
          <div className="mx-auto grid max-w-[84rem] items-center gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-20">
            <figure data-reveal className="relative isolate overflow-hidden rounded-[1.75rem] bg-[#020b26] shadow-[0_30px_60px_rgb(3_22_50/0.22)]">
              <div className="aspect-[4/3]">
                <Photo name="senegal-map" alt="Carte du Sénégal : les structures du réseau reliées entre elles" className="object-[72%_50%]" />
              </div>
              <figcaption className="absolute inset-y-0 left-0 flex w-3/5 flex-col justify-between p-6 text-white sm:w-1/2 sm:p-9">
                <Eyebrow light>Réseau national</Eyebrow>
                <span>
                  <span className="font-manrope block text-[clamp(3rem,6vw,4.75rem)] font-extrabold leading-none tracking-[-0.05em]">
                    {REGIONS.length}
                  </span>
                  <span className="font-manrope mt-1 block text-lg font-bold">régions</span>
                  <span className="mt-3 hidden max-w-[15rem] text-sm leading-relaxed text-white/75 sm:block">
                    Un même référentiel pour les hôpitaux, les centres de transfusion et le SAMU.
                  </span>
                </span>
              </figcaption>
            </figure>

            <div>
              <div data-reveal>
                <Eyebrow>Pourquoi Jappo Dundu ?</Eyebrow>
                <H2>Une solution essentielle pour notre système de santé.</H2>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-[#3d4a63]">
                  Parce qu’une meilleure coordination des ressources rend le système de santé plus fort, plus réactif et
                  plus solidaire.
                </p>
              </div>
              <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {BENEFITS.map((benefit, index) => (
                  <li key={benefit.title} data-reveal style={stagger(index)} className="border-t border-[#d5ddea] pt-5">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[#e3eaf8] text-[#0b3471]">
                      <benefit.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="font-manrope mt-4 text-[1.0625rem] font-extrabold">{benefit.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#3d4a63]">{benefit.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Confiance & sécurité */}
        <section className="bg-[#031632] text-white">
          <div className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="relative min-h-[22rem] overflow-hidden">
              <Photo name="doctor-security" alt="Un médecin dans le hall d’un hôpital" className="absolute inset-0 object-[30%_20%]" />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,#031632)] lg:bg-[linear-gradient(90deg,transparent_55%,#031632)]"
              />
            </div>
            <div className="px-5 py-16 sm:px-10 lg:py-24 lg:pl-14 lg:pr-[max(2.5rem,calc((100vw-84rem)/2))]">
              <div data-reveal>
                <Eyebrow light>Confiance & sécurité</Eyebrow>
                <H2 light>Vos données, notre priorité</H2>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-[#c3d0e4]">
                  Chaque accès est contrôlé selon le rôle, chaque action sensible est tracée : la plateforme se doit
                  d’être irréprochable.
                </p>
              </div>
              <ul data-reveal className="mt-10 grid gap-px overflow-hidden rounded-[1.375rem] bg-white/10 ring-1 ring-white/10 sm:grid-cols-2">
                {SECURITY.map((item) => (
                  <li key={item.title} className="flex gap-4 bg-[#062049] p-6">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10">
                      <item.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="font-manrope text-base font-extrabold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#b4c3da]">{item.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Don de sang */}
        <section id="don" className="scroll-mt-20 overflow-hidden px-5 py-24 lg:px-10">
          <div className="mx-auto grid max-w-[84rem] items-center gap-16 lg:grid-cols-2 lg:gap-20">
            <div>
              <div data-reveal>
                <Eyebrow>Don de sang</Eyebrow>
                <H2>Un don peut sauver jusqu’à trois vies.</H2>
                <p className="mt-4 max-w-lg text-base leading-relaxed text-[#3d4a63]">
                  Avec l’application Jappo Dundu, vous êtes prévenu quand un hôpital proche a besoin de votre groupe
                  sanguin. Un geste suffit pour répondre.
                </p>
              </div>
              <div data-reveal className="mt-8 rounded-[1.375rem] bg-white p-6 shadow-[0_8px_24px_rgb(7_24_57/0.06)] sm:p-7">
                <h3 className="font-manrope text-base font-extrabold">Qui peut donner ?</h3>
                <ul className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {DONOR_CONDITIONS.map((condition) => {
                    const Icon = CONDITION_ICON[condition.key]
                    return (
                      <li key={condition.key} className={`flex items-start gap-3.5 ${condition.key === 'health' ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : ''}`}>
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fde9ec] text-[#e0102f]">
                          <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                        </span>
                        <span className="pt-0.5">
                          <strong className="block text-[0.9375rem] font-bold leading-snug">{condition.title}</strong>
                          <span className="text-sm text-[#64728a]">{condition.detail}</span>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className={`${redButton} mt-8 h-12 text-sm`}>
                Conditions et lieux de don (CNTS) <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            {/* L'alerte telle que la reçoit un donneur, dans son rayon de recherche. */}
            <div data-reveal className="relative">
              <div className="relative isolate mx-auto w-fit py-6">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 -z-10 aspect-square w-[38rem] -translate-x-1/2 -translate-y-1/2"
                >
                  <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(242_11_43/0.13),transparent_62%)]" />
                  <span className="absolute inset-[6%] rounded-full border border-[#f20b2b]/10" />
                  <span className="absolute inset-[20%] rounded-full border border-dashed border-[#f20b2b]/25" />
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="ring-wave absolute inset-[14%] rounded-full border border-[#f20b2b]/30" style={stagger(i)} />
                  ))}
                  {[
                    'left-[9%] top-[38%]',
                    'left-[83%] top-[20%]',
                    'left-[89%] top-[62%]',
                    'left-[24%] top-[85%]',
                    'left-[62%] top-[7%]',
                  ].map((position) => (
                    <span key={position} className={`absolute h-2.5 w-2.5 rounded-full bg-[#f20b2b] ring-4 ring-[#f20b2b]/15 ${position}`} />
                  ))}
                </div>
                <DonorAlertPhone />
              </div>
              <p className="flex items-center justify-center gap-2 text-xs font-semibold text-[#64728a]">
                <Smartphone className="h-4 w-4 text-[#f20b2b]" aria-hidden="true" />
                Application donneurs, en test avec les premiers centres
              </p>
              <BloodNeeds className="relative z-20 mx-auto mt-6 max-w-sm sm:absolute sm:bottom-8 sm:left-0 sm:mt-0 sm:w-[21rem]" />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 bg-white px-5 py-20 lg:px-10">
          <div className="mx-auto grid max-w-[84rem] gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div data-reveal>
              <Eyebrow>Questions fréquentes</Eyebrow>
              <H2>Vous avez une question ?</H2>
            </div>
            <div className="divide-y divide-[#e3e8f0] border-y border-[#e3e8f0]">
              {FAQ.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-bold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <Plus className="h-5 w-5 shrink-0 text-[#f20b2b] transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
                  </summary>
                  <p className="max-w-2xl pb-5 text-[0.9375rem] leading-relaxed text-[#3d4a63]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Appel final */}
        <section className="relative isolate overflow-hidden text-white">
          <Photo
            name="dakar-coast"
            alt="La corniche de Dakar au coucher du soleil"
            className="absolute inset-0 -z-20 object-[center_45%]"
          />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(2_24_56/0.94),rgb(2_24_56/0.68)_43%,rgb(2_24_56/0.04))]" />
          <div data-reveal className="mx-auto max-w-[84rem] px-5 py-20 lg:px-10">
            <span className="block border-l-[3px] border-[#f20b2b] pl-3 text-sm font-bold">Jappo Dundu</span>
            <h2 className="font-manrope mt-3 text-[clamp(2rem,3.4vw,2.9rem)] font-extrabold leading-[1.08] tracking-[-0.03em]">
              Ensemble, construisons
              <br /> la santé de demain.
            </h2>
            <p className="mt-3 max-w-md text-base text-white/85">
              Hôpitaux, centres de transfusion et services d’ambulances : rejoignez le réseau.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={spaceLink.to} className={`${redButton} h-12 text-sm`}>
                {spaceLink.label} <ArrowRight className="btn-arrow h-4 w-4" aria-hidden="true" />
              </Link>
              {FULL_FEATURES && (
                <Link
                  to="/rejoindre"
                  className="inline-flex h-12 items-center rounded-full border border-white px-6 text-sm font-bold transition-colors hover:bg-white/10"
                >
                  Demander l’adhésion
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter spaceLink={spaceLink} />
    </div>
  )
}
