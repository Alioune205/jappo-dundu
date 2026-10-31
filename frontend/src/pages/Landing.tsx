import React, { useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  Activity,
  Ambulance,
  ArrowRight,
  BedDouble,
  Bell,
  BrainCircuit,
  Building2,
  Check,
  Droplets,
  ExternalLink,
  LockKeyhole,
  Plus,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { BrandMark, BrandName } from '@/components/layout/BrandMark'
import {
  AUDIENCES,
  BLOOD_NEEDS,
  DONOR_CONDITIONS,
  FAQ,
  KEY_FIGURES,
  MODULES,
  PILOTING,
  SCENARIO,
  SOURCE,
  type ModuleKey,
} from './landing/content'
import { useLandingMotion } from './landing/motion'
import { FULL_FEATURES } from '@/lib/features'

const NAV = [
  { href: '#modules', label: 'Modules' },
  { href: '#fonctionnement', label: 'Fonctionnement' },
  { href: '#publics', label: 'Publics' },
  { href: '#don', label: 'Don de sang' },
  { href: '#faq', label: 'FAQ' },
]

/** Identité de chaque module : icône, couleur, badge et photo. */
const MODULE_STYLE: Record<
  ModuleKey,
  { icon: React.ElementType; text: string; bar: string; softBg: string; badge: string; photo: string; alt: string }
> = {
  blood: {
    icon: Droplets,
    text: 'text-accent-red',
    bar: 'bg-accent-red',
    softBg: 'bg-accent-red/10',
    badge: 'Module 01 · Transfusion',
    photo: 'module-sang',
    alt: 'Une infirmière range des poches de sang dans un réfrigérateur de banque de sang',
  },
  beds: {
    icon: BedDouble,
    text: 'text-accent-blue',
    bar: 'bg-accent-blue',
    softBg: 'bg-accent-blue/10',
    badge: 'Module 02 · Hospitalisation',
    photo: 'module-lits',
    alt: 'Une soignante prépare un lit dans une chambre d’hôpital lumineuse',
  },
  ambulances: {
    icon: Ambulance,
    text: 'text-accent-green',
    bar: 'bg-accent-green',
    softBg: 'bg-accent-green/10',
    badge: 'Module 03 · Régulation SAMU',
    photo: 'module-ambulance',
    alt: 'Une ambulance roule dans une avenue de Dakar',
  },
}

const AUDIENCE_ICONS = [Smartphone, Building2, Radio, Users]
const PILOTING_ICONS = [Activity, BrainCircuit, LockKeyhole]

/** Engagements de la plateforme, affichés sous l'accroche (faits vérifiables dans le code). */
const ASSURANCES = [
  'Accès par rôle et par établissement',
  'Mises à jour en temps réel',
  'Application mobile pour les donneurs',
]

const btnPrimary =
  'btn inline-flex items-center justify-center gap-2 rounded-xl bg-brand font-semibold text-on-brand shadow-[0_10px_24px_-8px_var(--brand)] transition-all hover:bg-brand-strong'
const btnOnDark =
  'btn inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.04] font-semibold text-white backdrop-blur-xs transition-all hover:border-white/45 hover:bg-white/10'
const btnOutline =
  'btn inline-flex items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface font-semibold text-fg shadow-2xs transition-all hover:border-fg/40 hover:bg-raised/50'

/** Rang d'un élément dans sa série : décale son apparition (voir index.css). */
const stagger = (i: number) => ({ '--i': i }) as React.CSSProperties

/** Étiquette de section, titre et introduction. */
const SectionHeader: React.FC<{
  eyebrow: string
  title: React.ReactNode
  intro?: string
  invert?: boolean
  className?: string
}> = ({ eyebrow, title, intro, invert = false, className = 'max-w-2xl' }) => (
  <div data-reveal className={className}>
    <p
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-label text-[11px] font-semibold ${
        invert
          ? 'border-white/15 bg-white/[0.06] text-amber'
          : 'border-brand/20 bg-brand/[0.06] text-brand'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${invert ? 'bg-amber' : 'bg-brand'}`}
        aria-hidden="true"
      />
      {eyebrow}
    </p>
    <h2
      className={`font-display mt-4 text-3xl leading-[1.12] tracking-tight sm:text-4xl ${
        invert ? 'text-white' : 'text-fg'
      }`}
    >
      {title}
    </h2>
    {intro && (
      <p className={`mt-4 text-base leading-relaxed sm:text-lg ${invert ? 'text-on-navy-muted' : 'text-muted'}`}>
        {intro}
      </p>
    )}
  </div>
)

/** Formats essayés dans l'ordre pour chaque photo. */
const PHOTO_FORMATS = ['webp', 'jpg']

/**
 * Photo de la page (WebP, puis JPEG). Si aucun fichier n'existe encore, un
 * fond bleu nuit quadrillé avec un pictogramme prend sa place : jamais d'image
 * cassée.
 */
const Photo: React.FC<{
  name: string
  alt: string
  className?: string
  icon?: React.ElementType
  eager?: boolean
}> = ({ name, alt, className = '', icon: Icon = Activity, eager = false }) => {
  const [attempt, setAttempt] = useState(0)
  if (attempt >= PHOTO_FORMATS.length) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex h-full w-full items-center justify-center bg-navy bg-[radial-gradient(circle_at_70%_20%,color-mix(in_oklab,var(--brand)_28%,transparent),transparent_60%)] ${className}`}
      >
        <Icon className="h-12 w-12 text-white/20" aria-hidden="true" />
      </div>
    )
  }
  return (
    <img
      src={`/images/landing/${name}.${PHOTO_FORMATS[attempt]}`}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setAttempt((n) => n + 1)}
      className={`h-full w-full object-cover ${className}`}
    />
  )
}

/** Activité récente affichée dans l'aperçu (décorative). */
const MOCK_ACTIVITY = [
  { dot: 'bg-accent-red', title: 'Demande urgente · groupe O−', place: 'Hôpital Principal de Dakar', time: '1 min' },
  { dot: 'bg-accent-blue', title: 'Lit libéré · Réanimation', place: 'CHU de Fann', time: '3 min' },
  { dot: 'bg-accent-green', title: 'Ambulance affectée · DK-5120', place: 'SAMU 15', time: '6 min' },
]

const MOCK_KPIS = [
  { label: 'Lits libres', value: '78', note: '+3 depuis ce matin', icon: BedDouble, cls: 'text-accent-blue', bar: 'w-3/4 bg-accent-blue' },
  { label: 'Stock O−', value: '2', note: 'poches · critique', icon: Droplets, cls: 'text-accent-red', bar: 'w-1/4 bg-accent-red' },
  { label: 'Missions', value: '4', note: 'en cours', icon: Ambulance, cls: 'text-accent-green', bar: 'w-2/3 bg-accent-green' },
]

/** Aperçu du tableau de bord (décoratif) : indicateurs, carte et activité. */
const ProductMock: React.FC = () => (
  <div aria-hidden="true" className="relative">
    <div className="overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-[0_40px_90px_-20px_rgb(0_0_0/0.65)]">
      {/* Barre de fenêtre */}
      <div className="flex items-center gap-2 border-b border-line bg-raised/90 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-accent-red/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-accent-green/70" />
        <span className="ml-2 text-xs font-bold tracking-tight text-fg">Supervision nationale</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-accent-green/25 bg-accent-green/10 px-2.5 py-0.5 text-2xs font-semibold text-accent-green">
          <span className="live-pulse h-1.5 w-1.5 rounded-full bg-accent-green" /> Temps réel
        </span>
      </div>

      <div className="space-y-3.5 p-4">
        <div className="grid grid-cols-3 gap-3">
          {MOCK_KPIS.map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-line bg-raised/40 p-3">
              <div className="flex items-center justify-between text-2xs font-medium text-muted">
                {kpi.label}
                <kpi.icon className={`h-3.5 w-3.5 ${kpi.cls}`} />
              </div>
              <div className="num mt-1.5 text-2xl font-bold tracking-tight text-fg">{kpi.value}</div>
              <div className={`mt-0.5 truncate text-2xs font-medium ${kpi.cls}`}>{kpi.note}</div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
                <div className={`h-full rounded-full ${kpi.bar}`} />
              </div>
            </div>
          ))}
        </div>

        <div className="relative h-40 overflow-hidden rounded-xl border border-line bg-raised">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" preserveAspectRatio="none">
            <defs>
              <pattern id="mock-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M24 0H0V24" fill="none" stroke="var(--line)" strokeWidth="0.75" />
              </pattern>
            </defs>
            <rect width="400" height="160" fill="url(#mock-grid)" />
            <path
              className="route-flow"
              d="M50 125 C 130 110, 160 55, 240 62 S 320 35, 350 28"
              fill="none"
              stroke="var(--accent-green)"
              strokeWidth="2.5"
              strokeDasharray="6 7"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute left-[10%] top-[72%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-green bg-surface shadow-sm">
            <Ambulance className="h-4 w-4 text-accent-green" />
          </span>
          <span className="route-runner absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-green shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent-green)_25%,transparent)]" />
          <span className="route-target absolute left-[84%] top-[8%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-blue bg-surface shadow-sm">
            <BedDouble className="h-4 w-4 text-accent-blue" />
          </span>
          <span className="ping absolute left-[48%] top-[30%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-red bg-surface text-accent-red shadow-sm">
            <Droplets className="h-4 w-4" />
          </span>
        </div>

        <ul className="divide-y divide-line rounded-xl border border-line bg-raised/25">
          {MOCK_ACTIVITY.map((row) => (
            <li key={row.title} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-fg">{row.title}</span>
                <span className="block truncate text-2xs text-muted">{row.place}</span>
              </span>
              <span className="num shrink-0 rounded-md bg-raised px-1.5 py-0.5 text-2xs font-medium text-subtle">
                {row.time}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
)

/** Visuel de l'accroche : une photo et les informations que la plateforme fait circuler. */
const HeroVisual: React.FC = () => (
  <div data-hero-mock className="relative mx-auto w-full max-w-xl lg:max-w-none">
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-white/15 shadow-[0_44px_96px_-24px_rgb(0_0_0/0.68)] lg:aspect-[5/4]">
      <Photo
        name="hero"
        eager
        icon={Ambulance}
        alt="Une équipe de secours sénégalaise prend en charge un patient devant une ambulance"
        className="absolute inset-0 object-[55%_50%] transition-transform duration-700 hover:scale-[1.02]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-navy/85 via-navy/20 to-transparent"
      />
      {/* Mission en cours, sur la photo. */}
      <div
        aria-hidden="true"
        className="absolute bottom-5 left-5 right-5 hidden items-center justify-between gap-3 rounded-2xl border border-white/15 bg-navy/80 px-4 py-3.5 text-white backdrop-blur-xl sm:flex"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-green text-white shadow-sm">
            <Ambulance className="h-5 w-5" />
          </span>
          <div>
            <span className="block text-sm font-bold">Ambulance DK-5120 · en route</span>
            <span className="block text-xs text-on-navy-muted">Lit réservé · CHU de Fann · ETA 6 min</span>
          </div>
        </div>
        <span className="rounded-full border border-accent-green/35 bg-accent-green/15 px-2.5 py-1 text-2xs font-semibold text-accent-green">
          Verrouillé
        </span>
      </div>
    </div>

    {/* Lits disponibles, comme sur le tableau de bord. */}
    <div
      aria-hidden="true"
      className="absolute -left-3 top-6 hidden w-52 rounded-2xl border border-line bg-surface/95 p-4 shadow-[var(--shadow-raised)] backdrop-blur-md sm:block lg:-left-10"
    >
      <div className="flex items-center justify-between text-2xs font-medium text-muted">
        Lits libres · Dakar
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-green/12 px-2 py-0.5 font-semibold text-accent-green">
          <span className="live-pulse h-1.5 w-1.5 rounded-full bg-accent-green" /> Direct
        </span>
      </div>
      <div className="num mt-1.5 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight text-fg">78</span>
        <span className="text-2xs font-semibold text-accent-blue">+3 ce matin</span>
      </div>
      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <div className="h-full w-3/4 rounded-full bg-accent-blue" />
      </div>
    </div>

    {/* Alerte telle que le donneur la reçoit sur son téléphone. */}
    <div
      aria-hidden="true"
      className="hero-notif absolute -bottom-9 -right-2 w-68 rounded-2xl border border-line bg-surface/95 p-4 shadow-[var(--shadow-raised)] backdrop-blur-md sm:-right-6"
    >
      <div className="flex items-center justify-between text-2xs font-semibold text-brand">
        <span className="inline-flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" /> Jappo Dundu · maintenant
        </span>
        <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-[10px]">Urgence vitale</span>
      </div>
      <p className="mt-1.5 text-sm font-bold text-fg">Sang O− recherché à 2,4 km</p>
      <p className="text-xs text-muted">Hôpital Principal · 2 poches requises</p>
    </div>
  </div>
)

/**
 * Page d'accueil publique : présenter la plateforme (sang, lits, ambulances),
 * ses publics et le don de sang. Style institutionnel et épuré de haut niveau.
 */
export const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const rootRef = useRef<HTMLDivElement>(null)
  useLandingMotion(rootRef)
  const spaceLink = isAuthenticated
    ? { to: '/', label: 'Mon espace', short: 'Mon espace' }
    : { to: '/login', label: 'Espace professionnel', short: 'Espace pro' }

  return (
    <div ref={rootRef} className="landing min-h-full overflow-x-hidden bg-canvas text-fg">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        Aller au contenu
      </a>

      {/* En-tête */}
      <header className="landing-nav sticky top-0 z-40 border-b border-line/80 bg-surface/90 backdrop-blur-xl">
        <nav aria-label="Navigation principale" className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5">
          <a href="#haut" className="flex shrink-0 items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <BrandName className="text-lg" />
          </a>
          <ul className="mx-auto hidden items-center gap-1 rounded-full border border-line/70 bg-raised/50 p-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted transition-all hover:bg-surface hover:text-fg hover:shadow-2xs"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2.5 lg:ml-0">
            <a
              href="#don"
              className="hidden rounded-xl px-3.5 py-2 text-sm font-semibold text-fg transition-colors hover:bg-raised hover:text-brand md:block"
            >
              Devenir donneur
            </a>
            <Link to={spaceLink.to} className={`${btnPrimary} h-10 whitespace-nowrap px-4 text-sm`}>
              <span className="sm:hidden">{spaceLink.short}</span>
              <span className="hidden sm:inline">{spaceLink.label}</span>
              <ArrowRight className="btn-arrow h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>
      </header>

      <main id="contenu">
        {/* Accroche */}
        <section id="haut" className="relative overflow-hidden bg-navy text-on-navy">
          <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 opacity-75" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-56 h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand)_30%,transparent),transparent_65%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-32 bottom-0 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgb(37_99_235/0.18),transparent_65%)]"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-28 pt-16 lg:grid-cols-[1.02fr_0.98fr] lg:pb-32 lg:pt-24">
            <div>
              <p
                data-hero
                style={stagger(0)}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-on-navy-muted backdrop-blur-xs"
              >
                <span className="live-pulse h-2 w-2 rounded-full bg-amber" aria-hidden="true" />
                Plateforme de coordination des urgences · Sénégal
              </p>
              <h1
                data-hero
                style={stagger(1)}
                className="font-display mt-6 text-4xl leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-[3.55rem]"
              >
                Le sang, les lits et les ambulances, <span className="text-amber">enfin connectés.</span>
              </h1>
              <p data-hero style={stagger(2)} className="mt-6 max-w-xl text-lg leading-relaxed text-on-navy-muted">
                Jappo Dundu relie en temps réel les donneurs, les hôpitaux et le SAMU : l’ambulance la plus proche, le
                lit disponible et le donneur compatible, au même endroit.
              </p>
              <div data-hero style={stagger(3)} className="mt-9 flex flex-wrap gap-3.5">
                <a href="#modules" className={`${btnPrimary} h-12 px-6 text-base`}>
                  Découvrir les modules
                  <ArrowRight className="btn-arrow h-5 w-5" aria-hidden="true" />
                </a>
                <a href="#don" className={`${btnOnDark} h-12 px-6 text-base`}>
                  Devenir donneur
                </a>
              </div>
              <ul data-hero style={stagger(4)} className="mt-10 flex flex-wrap gap-x-6 gap-y-2.5 border-t border-white/10 pt-6">
                {ASSURANCES.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-on-navy-muted">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-green/15">
                      <Check className="h-3.5 w-3.5 text-accent-green" aria-hidden="true" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* Repères Bento */}
        <section aria-label="La plateforme en chiffres" className="border-b border-line bg-surface">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 px-5 lg:grid-cols-4 lg:divide-x lg:divide-line">
            {KEY_FIGURES.map((figure, index) => (
              <div
                key={figure.label}
                data-reveal
                style={stagger(index)}
                className="group flex flex-col px-3 py-10 transition-colors hover:bg-raised/35 lg:px-8"
              >
                <span className="num mb-2 text-2xs font-bold tracking-widest text-brand/80 uppercase">
                  0{index + 1}
                </span>
                <dt className="order-2 mt-2 max-w-[15rem] text-sm leading-snug text-muted">{figure.label}</dt>
                <dd className="num -order-1 text-4xl font-extrabold tracking-tight text-fg sm:text-[2.65rem]">
                  <span aria-hidden="true" data-count={figure.value}>
                    {figure.value}
                  </span>
                  <span className="sr-only">{figure.value}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Modules */}
        <section id="modules" className="scroll-mt-16 py-24">
          <div className="mx-auto max-w-7xl px-5">
            <SectionHeader
              eyebrow="Trois modules, une seule plateforme"
              title="Tout ce qu’il faut pour gérer une urgence"
              intro="Chaque module fonctionne seul, et ils partagent les mêmes données : un lit libéré ou une ambulance disponible se voit partout, aussitôt."
            />
            <div className="mt-14 grid gap-7 lg:grid-cols-3">
              {MODULES.map((module, index) => {
                const style = MODULE_STYLE[module.key]
                const Icon = style.icon
                return (
                  <article
                    key={module.key}
                    data-reveal
                    style={stagger(index)}
                    className="lift group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-panel)] transition-all hover:border-line-strong"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden">
                      <Photo
                        name={style.photo}
                        alt={style.alt}
                        icon={Icon}
                        className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-gradient-to-t from-navy/65 via-transparent to-transparent"
                      />
                      <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-navy/70 px-3 py-1 text-2xs font-semibold text-white backdrop-blur-md">
                        {style.badge}
                      </span>
                      <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-1.5 ${style.bar}`} />
                    </div>
                    <div className="relative flex flex-1 flex-col px-7 pb-8">
                      <span className="lift-icon -mt-6 flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-surface shadow-[var(--shadow-panel)]">
                        <Icon className={`h-6 w-6 ${style.text}`} aria-hidden="true" />
                      </span>
                      <h3 className="mt-5 text-xl font-bold tracking-tight text-fg">{module.name}</h3>
                      <p className={`mt-1 text-sm font-semibold ${style.text}`}>{module.tagline}</p>
                      <ul className="mt-6 space-y-3 border-t border-line pt-6">
                        {module.features.map((feature) => (
                          <li key={feature} className="flex gap-3 text-sm leading-relaxed text-muted">
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${style.softBg}`}
                            >
                              <Check className={`h-3.5 w-3.5 ${style.text}`} aria-hidden="true" />
                            </span>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* Fonctionnement : une urgence de bout en bout */}
        <section id="fonctionnement" className="scroll-mt-16 border-y border-line bg-surface py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <SectionHeader
                eyebrow="Fonctionnement"
                title="Une urgence, du premier appel au don de sang"
                intro="Un accident sur la route : voici comment les trois modules se relaient, minute par minute."
              />
              <div
                data-reveal="photo"
                className="relative mt-10 aspect-[4/3] overflow-hidden rounded-2xl border border-line shadow-[var(--shadow-panel)]"
              >
                <Photo
                  name="urgence"
                  icon={Radio}
                  alt="Une régulatrice du SAMU coordonne une intervention depuis la salle de régulation"
                  className="absolute inset-0 object-[80%_50%]"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/95 via-navy/50 to-transparent p-6 pt-20">
                  <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wider text-amber uppercase">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Chaîne de survie synchronisée
                  </p>
                  <p className="mt-1 text-lg font-bold text-white">
                    25 minutes, trois modules, une seule chaîne de secours.
                  </p>
                </div>
              </div>
            </div>
            <ol className="space-y-4 lg:pt-2">
              {SCENARIO.map((step, index) => {
                const style = MODULE_STYLE[step.module]
                const Icon = style.icon
                return (
                  <li
                    key={step.title}
                    data-reveal
                    style={stagger(index)}
                    className="group relative flex gap-5 rounded-2xl border border-line bg-canvas/55 p-5 transition-all hover:border-line-strong hover:bg-surface hover:shadow-xs"
                  >
                    <span
                      className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-surface shadow-2xs ${style.softBg}`}
                    >
                      <Icon className={`h-5 w-5 ${style.text}`} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="num rounded-md bg-raised px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-fg">
                          Étape {index + 1}
                        </span>
                        <span className={`num text-xs font-semibold ${style.text}`}>T + {step.time}</span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-fg">{step.title}</h3>
                      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted">{step.text}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        </section>

        {/* Publics */}
        <section id="publics" className="scroll-mt-16 py-24">
          <div className="mx-auto max-w-7xl px-5">
            <SectionHeader
              eyebrow="Publics"
              title="Chacun son espace, chacun son rôle"
              intro="Un administrateur par domaine : chacun ne voit que ce qui le concerne, pour son établissement."
            />
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map((audience, index) => {
                const Icon = AUDIENCE_ICONS[index]
                return (
                  <div
                    key={audience.who}
                    data-reveal
                    style={stagger(index)}
                    className="lift flex flex-col rounded-2xl border border-line bg-surface p-7 shadow-[var(--shadow-panel)] transition-all hover:border-line-strong"
                  >
                    <span className="lift-icon flex h-12 w-12 items-center justify-center rounded-xl bg-navy text-white shadow-sm">
                      <Icon className="h-5 w-5 text-amber" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold tracking-tight text-fg">{audience.who}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{audience.text}</p>
                    <p className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-raised/70 px-3 py-1 text-2xs font-semibold text-fg">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
                      {audience.where}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Pilotage */}
        <section className="relative overflow-hidden bg-navy py-24 text-on-navy">
          <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 opacity-75" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div data-reveal className="order-2 lg:order-1">
              <ProductMock />
            </div>
            <div className="order-1 lg:order-2">
              <SectionHeader
                invert
                eyebrow="Pilotage"
                title="Voir, anticiper, protéger"
                intro="Un tableau de bord par rôle : l’essentiel du réseau sur un seul écran."
              />
              <ul className="mt-10 space-y-5">
                {PILOTING.map((item, index) => {
                  const Icon = PILOTING_ICONS[index]
                  return (
                    <li
                      key={item.title}
                      data-reveal
                      style={stagger(index)}
                      className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xs"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                        <Icon className="h-5 w-5 text-amber" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-white">{item.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-on-navy-muted">{item.text}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </section>

        {/* Don de sang */}
        <section id="don" className="scroll-mt-16 py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 lg:grid-cols-2 lg:items-start">
            <div>
              <SectionHeader
                eyebrow="Don de sang"
                title="Un don peut sauver jusqu’à trois vies"
                intro="Avec l’application, vous êtes prévenu quand un hôpital proche a besoin de votre groupe sanguin."
              />
              <div data-reveal className="mt-10 rounded-2xl border border-line bg-surface p-7 shadow-[var(--shadow-panel)]">
                <h3 className="text-sm font-bold tracking-wide text-fg uppercase">Conditions pour donner</h3>
                <ul className="mt-5 space-y-3.5">
                  {DONOR_CONDITIONS.map((condition) => (
                    <li key={condition} className="flex items-start gap-3 text-[0.9375rem] text-fg">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-green/12">
                        <Check className="h-3.5 w-3.5 text-accent-green" aria-hidden="true" />
                      </span>
                      <span>{condition}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href={SOURCE.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btnOutline} mt-6 h-11 px-5 text-sm`}
              >
                Conditions complètes et lieux de don (CNTS)
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>

            <div className="flex flex-col gap-6">
              <div
                data-reveal="photo"
                className="aspect-[16/10] overflow-hidden rounded-2xl border border-line shadow-[var(--shadow-panel)]"
              >
                <Photo
                  name="don"
                  icon={Droplets}
                  alt="Une jeune donneuse sourit pendant son don de sang, accompagnée d’une infirmière"
                />
              </div>
              <div data-reveal className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-panel)]">
                <div className="flex items-baseline justify-between gap-4 border-b border-line bg-raised/35 px-6 py-4">
                  <h3 className="text-base font-bold text-fg">Groupes recherchés</h3>
                  <p className="text-xs font-medium text-muted">CNTS · {BLOOD_NEEDS.updated}</p>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-line">
                  {BLOOD_NEEDS.groups.map((g, index) => {
                    const critical = g.level === 'critical'
                    return (
                      <li key={g.group} data-reveal="scale" style={stagger(index + 1)} className="px-6 py-5">
                        <span className="block text-3xl font-extrabold tracking-tight text-fg">{g.group}</span>
                        <span
                          className={`mt-2 inline-flex rounded-md px-2 py-0.5 text-2xs font-semibold ${
                            critical ? 'heartbeat bg-brand text-on-brand' : 'bg-raised text-fg'
                          }`}
                        >
                          {critical ? 'Critique' : 'En baisse'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
                <div className="flex items-center gap-3 border-t border-line bg-raised/25 px-6 py-4">
                  <Smartphone className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <p className="text-sm text-muted">
                    L’application des donneurs (Android et iPhone) est en phase de test avec les premiers centres.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t border-line bg-surface py-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-[0.8fr_1.2fr]">
            <SectionHeader
              eyebrow="Questions fréquentes"
              title="Vous avez une question ?"
              intro="L’essentiel sur la plateforme, les données et le don de sang."
              className="lg:sticky lg:top-28 lg:self-start"
            />
            <div className="space-y-3">
              {FAQ.map((item, index) => (
                <details
                  key={item.q}
                  data-reveal
                  style={stagger(index)}
                  className="group rounded-2xl border border-line bg-canvas/45 px-6 transition-colors open:border-line-strong open:bg-surface"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-semibold text-fg hover:text-brand [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-45 motion-reduce:transition-none">
                      <Plus className="h-4 w-4 text-brand" aria-hidden="true" />
                    </span>
                  </summary>
                  <p className="max-w-2xl pb-6 text-[0.9375rem] leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Appel final */}
        <section className="px-5 py-24">
          <div
            data-reveal
            className="relative mx-auto grid max-w-7xl overflow-hidden rounded-3xl border border-white/10 bg-navy text-on-navy shadow-[0_32px_72px_-18px_rgb(11_31_58/0.45)] lg:grid-cols-2"
          >
            <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0 opacity-75" />
            <div className="relative p-8 sm:p-12 lg:p-14">
              <p className="font-label font-semibold text-amber">Pourquoi Jappo Dundu</p>
              <h2 className="font-display mt-3 text-3xl leading-tight text-white sm:text-4xl">
                Derrière chaque alerte, une vie à sauver.
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-on-navy-muted">
                Une hémorragie après un accouchement, un accident de la route : quand le sang, le lit et l’ambulance
                arrivent à temps, une famille reste entière.
              </p>
              <div className="mt-8 border-t border-white/10 pt-8">
                <p className="text-base font-semibold text-white">Votre établissement veut rejoindre le réseau ?</p>
                <p className="mt-1 text-sm text-on-navy-muted">
                  Hôpitaux, centres de transfusion et services d’ambulances : envoyez une demande d’adhésion.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  {FULL_FEATURES && (
                    <Link to="/rejoindre" className={`${btnPrimary} h-12 px-6 text-base`}>
                      Demander l’adhésion
                      <ArrowRight className="btn-arrow h-5 w-5" aria-hidden="true" />
                    </Link>
                  )}
                  <Link to={spaceLink.to} className={`${btnOnDark} h-12 px-6 text-base`}>
                    {spaceLink.label}
                  </Link>
                </div>
              </div>
            </div>
            <div className="relative min-h-72">
              <Photo
                name="impact"
                alt="Une mère tient son nouveau-né dans ses bras"
                className="absolute inset-0 object-[60%_45%]"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-b from-navy via-transparent to-transparent lg:bg-gradient-to-r"
              />
            </div>
          </div>
        </section>
      </main>

      {/* Pied de page */}
      <footer className="bg-navy text-on-navy">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/logo-mark-dark.png" alt="" aria-hidden="true" className="h-10 w-10 object-contain" />
              <span className="text-lg font-bold tracking-tight">
                <span className="text-white">Jappo</span> <span className="text-amber">Dundu</span>
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-on-navy-muted">
              « Connecter la vie » : la plateforme qui relie donneurs, hôpitaux et ambulances au Sénégal. Projet de fin
              d’études.
            </p>
          </div>
          <div>
            <h3 className="font-label font-semibold text-white">Plateforme</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-on-navy-muted transition-colors hover:text-white">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-label font-semibold text-white">Accès</h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link to={spaceLink.to} className="text-on-navy-muted transition-colors hover:text-white">
                  {spaceLink.label}
                </Link>
              </li>
              <li>
                <a
                  href={SOURCE.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-on-navy-muted transition-colors hover:text-white"
                >
                  Donner son sang (CNTS)
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-5 py-6 text-xs leading-relaxed text-on-navy-muted">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
            Jappo Dundu n’est pas un service officiel du CNTS. Informations sur le don de sang issues de{' '}
            <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              cnts.gouv.sn
            </a>
            {`, consulté le ${SOURCE.consulted}. Images d’illustration ; photo « mère et nouveau-né » : `}
            <a
              href="https://unsplash.com/license"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white"
            >
              Unsplash
            </a>
            .
          </p>
        </div>
      </footer>
    </div>
  )
}
