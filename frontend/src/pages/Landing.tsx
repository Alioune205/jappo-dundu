import React, { useRef } from 'react'
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

const NAV = [
  { href: '#modules', label: 'Modules' },
  { href: '#fonctionnement', label: 'Fonctionnement' },
  { href: '#publics', label: 'Publics' },
  { href: '#don', label: 'Don de sang' },
  { href: '#faq', label: 'FAQ' },
]

/** Identité de chaque module : icône et couleur. */
const MODULE_STYLE: Record<ModuleKey, { icon: React.ElementType; text: string; soft: string; bar: string }> = {
  blood: { icon: Droplets, text: 'text-accent-red', soft: 'bg-accent-red/10', bar: 'bg-accent-red' },
  beds: { icon: BedDouble, text: 'text-accent-blue', soft: 'bg-accent-blue/10', bar: 'bg-accent-blue' },
  ambulances: { icon: Ambulance, text: 'text-accent-green', soft: 'bg-accent-green/10', bar: 'bg-accent-green' },
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
  'btn inline-flex items-center justify-center gap-2 rounded-lg bg-brand font-semibold text-on-brand shadow-[0_8px_20px_-8px_var(--brand)] hover:bg-brand-strong'
const btnOnDark =
  'btn inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 font-semibold text-white hover:border-white/50 hover:bg-white/10'
const btnOutline =
  'btn inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface font-semibold text-fg hover:border-fg/40'

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
    <p className={`font-label font-semibold ${invert ? 'text-amber' : 'text-brand'}`}>{eyebrow}</p>
    <h2 className={`font-display mt-3 text-3xl leading-tight sm:text-4xl ${invert ? 'text-white' : 'text-fg'}`}>
      {title}
    </h2>
    {intro && (
      <p className={`mt-4 text-lg leading-relaxed ${invert ? 'text-on-navy-muted' : 'text-muted'}`}>{intro}</p>
    )}
  </div>
)

/** Photo de la page (WebP, JPEG de secours). Crédits : public/images/landing/CREDITS.md. */
const Photo: React.FC<{ name: string; alt: string; className?: string }> = ({ name, alt, className = '' }) => (
  <picture>
    <source srcSet={`/images/landing/${name}.webp`} type="image/webp" />
    <img
      src={`/images/landing/${name}.jpg`}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
    />
  </picture>
)

/** Activité récente affichée dans l'aperçu (décorative). */
const MOCK_ACTIVITY = [
  { dot: 'bg-accent-red', title: 'Demande urgente · groupe O−', place: 'Hôpital Principal de Dakar', time: '1 min' },
  { dot: 'bg-accent-blue', title: 'Lit libéré · Réanimation', place: 'CHU de Fann', time: '3 min' },
  { dot: 'bg-accent-green', title: 'Ambulance affectée · DK-5120', place: 'SAMU 15', time: '6 min' },
]

const MOCK_KPIS = [
  { label: 'Lits libres', value: '78', note: '+3 depuis ce matin', icon: BedDouble, cls: 'text-accent-blue' },
  { label: 'Stock O−', value: '2', note: 'poches · critique', icon: Droplets, cls: 'text-accent-red' },
  { label: 'Missions', value: '4', note: 'en cours', icon: Ambulance, cls: 'text-accent-green' },
]

/** Aperçu du tableau de bord (décoratif) : indicateurs, carte et activité. */
const ProductMock: React.FC = () => (
  <div aria-hidden="true" data-hero-mock className="relative">
    <div className="overflow-hidden rounded-xl border border-white/10 bg-surface shadow-[0_40px_80px_-24px_rgb(0_0_0/0.55)]">
      {/* Barre de fenêtre */}
      <div className="flex items-center gap-2 border-b border-line bg-raised px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 text-xs font-semibold text-fg">Supervision nationale</span>
        <span className="ml-auto flex items-center gap-1.5 text-2xs font-semibold text-accent-green">
          <span className="live-pulse h-1.5 w-1.5 rounded-full bg-accent-green" /> Temps réel
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-3">
          {MOCK_KPIS.map((kpi) => (
            <div key={kpi.label} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between text-2xs font-medium text-muted">
                {kpi.label}
                <kpi.icon className={`h-3.5 w-3.5 ${kpi.cls}`} />
              </div>
              <div className="num mt-1.5 text-2xl font-bold text-fg">{kpi.value}</div>
              <div className={`truncate text-2xs ${kpi.cls}`}>{kpi.note}</div>
            </div>
          ))}
        </div>

        <div className="relative h-36 overflow-hidden rounded-lg border border-line bg-raised">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" preserveAspectRatio="none">
            <defs>
              <pattern id="mock-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="var(--line)" strokeWidth="1" />
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
          <span className="absolute left-[10%] top-[72%] flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent-green bg-surface">
            <Ambulance className="h-3.5 w-3.5 text-accent-green" />
          </span>
          {/* Pastille qui suit la route de l'ambulance jusqu'au lit libre. */}
          <span className="route-runner absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-green shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent-green)_25%,transparent)]" />
          <span className="route-target absolute left-[84%] top-[8%] flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent-blue bg-surface">
            <BedDouble className="h-3.5 w-3.5 text-accent-blue" />
          </span>
          <span className="ping absolute left-[48%] top-[30%] flex h-7 w-7 items-center justify-center rounded-full border-2 border-accent-red bg-surface text-accent-red">
            <Droplets className="h-3.5 w-3.5" />
          </span>
        </div>

        <ul className="divide-y divide-line rounded-lg border border-line">
          {MOCK_ACTIVITY.map((row) => (
            <li key={row.title} className="flex items-center gap-3 px-3 py-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-fg">{row.title}</span>
                <span className="block truncate text-2xs text-muted">{row.place}</span>
              </span>
              <span className="num shrink-0 text-2xs text-subtle">{row.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>

    {/* Alerte telle que le donneur la reçoit sur son téléphone. */}
    <div className="hero-notif absolute -bottom-12 -right-2 w-64 rounded-xl border border-line bg-surface p-3.5 shadow-[var(--shadow-raised)] sm:-right-6">
      <div className="flex items-center gap-2 text-2xs font-semibold text-brand">
        <Bell className="h-3.5 w-3.5" /> Jappo Dundu · maintenant
      </div>
      <p className="mt-1 text-sm font-semibold text-fg">Sang O− recherché à 2,4 km</p>
      <p className="text-xs text-muted">Hôpital Principal · 2 poches</p>
    </div>
  </div>
)

/**
 * Page d'accueil publique : présenter la plateforme (sang, lits, ambulances),
 * ses publics et le don de sang. Style institutionnel (voir .landing dans
 * index.css) ; animations dans landing/motion.ts.
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
      <header className="landing-nav sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <nav aria-label="Navigation principale" className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5">
          <a href="#haut" className="flex shrink-0 items-center gap-2.5">
            <BrandMark className="h-9 w-9" />
            <BrandName className="text-lg" />
          </a>
          <ul className="mx-auto hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <a
              href="#don"
              className="hidden rounded-md px-3 py-2 text-sm font-semibold text-fg hover:text-brand md:block"
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
          <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-56 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--brand)_32%,transparent),transparent_65%)]"
          />
          <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-5 pb-28 pt-16 lg:grid-cols-[1fr_1.05fr] lg:pb-32 lg:pt-24">
            <div>
              <p
                data-hero
                style={stagger(0)}
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-on-navy-muted"
              >
                <span className="live-pulse h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
                Plateforme de coordination des urgences · Sénégal
              </p>
              <h1
                data-hero
                style={stagger(1)}
                className="font-display mt-6 text-4xl leading-[1.08] text-white sm:text-5xl lg:text-[3.5rem]"
              >
                Le sang, les lits et les ambulances, <span className="text-amber">enfin connectés.</span>
              </h1>
              <p data-hero style={stagger(2)} className="mt-6 max-w-xl text-lg leading-relaxed text-on-navy-muted">
                Jappo Dundu relie en temps réel les donneurs, les hôpitaux et le SAMU : l’ambulance la plus proche, le
                lit disponible et le donneur compatible, au même endroit.
              </p>
              <div data-hero style={stagger(3)} className="mt-9 flex flex-wrap gap-3">
                <a href="#modules" className={`${btnPrimary} h-12 px-6 text-base`}>
                  Découvrir les modules
                  <ArrowRight className="btn-arrow h-5 w-5" aria-hidden="true" />
                </a>
                <a href="#don" className={`${btnOnDark} h-12 px-6 text-base`}>
                  Devenir donneur
                </a>
              </div>
              <ul data-hero style={stagger(4)} className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
                {ASSURANCES.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-on-navy-muted">
                    <Check className="h-4 w-4 text-accent-green" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <ProductMock />
          </div>
        </section>

        {/* Repères */}
        <section aria-label="La plateforme en chiffres" className="border-b border-line bg-surface">
          <dl className="mx-auto grid max-w-7xl grid-cols-2 px-5 lg:grid-cols-4 lg:divide-x lg:divide-line">
            {KEY_FIGURES.map((figure, index) => (
              <div key={figure.label} data-reveal style={stagger(index)} className="flex flex-col px-2 py-10 lg:px-8">
                <dt className="order-2 mt-2 max-w-[15rem] text-sm leading-snug text-muted">{figure.label}</dt>
                <dd className="num -order-1 text-4xl font-bold tracking-tight text-fg">
                  {/* Compteur animé ; la valeur finale reste lisible par les lecteurs d'écran. */}
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
            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {MODULES.map((module, index) => {
                const style = MODULE_STYLE[module.key]
                const Icon = style.icon
                return (
                  <article
                    key={module.key}
                    data-reveal
                    style={stagger(index)}
                    className="lift relative overflow-hidden rounded-xl border border-line bg-surface p-8 shadow-[var(--shadow-panel)]"
                  >
                    <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${style.bar}`} />
                    <span className={`lift-icon flex h-12 w-12 items-center justify-center rounded-lg ${style.soft}`}>
                      <Icon className={`h-6 w-6 ${style.text}`} aria-hidden="true" />
                    </span>
                    <h3 className="mt-6 text-xl font-bold text-fg">{module.name}</h3>
                    <p className={`mt-1 text-sm font-semibold ${style.text}`}>{module.tagline}</p>
                    <ul className="mt-6 space-y-3 border-t border-line pt-6">
                      {module.features.map((feature) => (
                        <li key={feature} className="flex gap-3 text-sm leading-relaxed text-muted">
                          <Check className={`mt-0.5 h-4 w-4 shrink-0 ${style.text}`} aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        {/* Fonctionnement : une urgence de bout en bout */}
        <section id="fonctionnement" className="scroll-mt-16 border-y border-line bg-surface py-24">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <SectionHeader
                eyebrow="Fonctionnement"
                title="Une urgence, du premier appel au don de sang"
                intro="Un accident sur la route : voici comment les trois modules se relaient, minute par minute."
              />
              <div data-reveal="photo" className="relative mt-10 aspect-[4/3] overflow-hidden rounded-xl">
                <Photo name="need" alt="Une ambulance en intervention de nuit" className="absolute inset-0" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/90 to-transparent p-6 pt-20">
                  <p className="text-lg font-semibold text-white">
                    25 minutes, trois modules, une seule chaîne de secours.
                  </p>
                </div>
              </div>
            </div>
            <ol className="lg:pt-4">
              {SCENARIO.map((step, index) => {
                const style = MODULE_STYLE[step.module]
                const Icon = style.icon
                const last = index === SCENARIO.length - 1
                return (
                  <li key={step.title} data-reveal style={stagger(index)} className="relative flex gap-6 pb-12 last:pb-0">
                    {/* Fil de la chronologie */}
                    {!last && <span aria-hidden="true" className="absolute bottom-0 left-6 top-14 w-px bg-line-strong" />}
                    <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line bg-surface shadow-[var(--shadow-panel)]">
                      <Icon className={`h-5 w-5 ${style.text}`} aria-hidden="true" />
                    </span>
                    <div className="pt-1">
                      <p className="num text-xs font-semibold uppercase tracking-wider text-subtle">
                        Étape {index + 1} · T + {step.time}
                      </p>
                      <h3 className="mt-1.5 text-lg font-bold text-fg">{step.title}</h3>
                      <p className="mt-2 max-w-lg text-[0.9375rem] leading-relaxed text-muted">{step.text}</p>
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
                    className="lift flex flex-col rounded-xl border border-line bg-surface p-7"
                  >
                    <span className="lift-icon flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-white">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold text-fg">{audience.who}</h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{audience.text}</p>
                    <p className="mt-5 inline-flex w-fit rounded-md bg-raised px-2.5 py-1 text-2xs font-semibold text-fg">
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
          <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
          <div className="relative mx-auto max-w-7xl px-5">
            <SectionHeader invert eyebrow="Pilotage" title="Voir, anticiper, protéger" />
            <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 md:grid-cols-3">
              {PILOTING.map((item, index) => {
                const Icon = PILOTING_ICONS[index]
                return (
                  <div key={item.title} data-reveal style={stagger(index)} className="bg-navy p-8">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
                      <Icon className="h-5 w-5 text-amber" aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-on-navy-muted">{item.text}</p>
                  </div>
                )
              })}
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
              <div data-reveal className="mt-10 rounded-xl border border-line bg-surface p-6">
                <h3 className="text-sm font-bold text-fg">Conditions pour donner</h3>
                <ul className="mt-4 space-y-3">
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
              <div data-reveal="photo" className="aspect-[16/10] overflow-hidden rounded-xl">
                <Photo name="donate" alt="Un bras pendant un don de sang" className="object-[50%_22%]" />
              </div>
              <div data-reveal className="rounded-xl border border-line bg-surface">
                <div className="flex items-baseline justify-between gap-4 border-b border-line px-6 py-4">
                  <h3 className="text-base font-bold text-fg">Groupes recherchés</h3>
                  <p className="text-xs text-muted">CNTS · {BLOOD_NEEDS.updated}</p>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-line">
                  {BLOOD_NEEDS.groups.map((g, index) => {
                    const critical = g.level === 'critical'
                    return (
                      <li key={g.group} data-reveal="scale" style={stagger(index + 1)} className="px-6 py-5">
                        <span className="block text-3xl font-bold tracking-tight text-fg">{g.group}</span>
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
                <div className="flex items-center gap-3 border-t border-line px-6 py-4">
                  <Smartphone className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                  <p className="text-sm text-muted">L’application des donneurs arrive bientôt sur Android et iPhone.</p>
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
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map((item, index) => (
                <details key={item.q} data-reveal style={stagger(index)} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-semibold text-fg hover:text-brand [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-45 motion-reduce:transition-none">
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
            className="relative mx-auto grid max-w-7xl overflow-hidden rounded-2xl bg-navy text-on-navy lg:grid-cols-2"
          >
            <div aria-hidden="true" className="bg-grid pointer-events-none absolute inset-0" />
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
                  Hôpitaux, centres de transfusion et services d’ambulances : connectez-vous à Jappo Dundu.
                </p>
                <Link to={spaceLink.to} className={`${btnPrimary} mt-6 h-12 px-6 text-base`}>
                  {spaceLink.label}
                  <ArrowRight className="btn-arrow h-5 w-5" aria-hidden="true" />
                </Link>
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
                  <a href={item.href} className="text-on-navy-muted hover:text-white">
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
                <Link to={spaceLink.to} className="text-on-navy-muted hover:text-white">
                  {spaceLink.label}
                </Link>
              </li>
              <li>
                <a
                  href={SOURCE.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-on-navy-muted hover:text-white"
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
            {`, consulté le ${SOURCE.consulted}. Photos : `}
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
