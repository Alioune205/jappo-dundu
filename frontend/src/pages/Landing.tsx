import React from 'react'
import { Link } from 'react-router'
import {
  Activity,
  Ambulance,
  ArrowRight,
  BedDouble,
  Bell,
  BrainCircuit,
  Building2,
  CheckCircle2,
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
  TICKER,
  type ModuleKey,
} from './landing/content'

const NAV = [
  { href: '#modules', label: 'Modules' },
  { href: '#urgence', label: 'Comment ça marche' },
  { href: '#publics', label: 'Pour qui' },
  { href: '#don', label: 'Don de sang' },
  { href: '#faq', label: 'FAQ' },
]

/** Identité de chaque module : icône et couleur. */
const MODULE_STYLE: Record<ModuleKey, { icon: React.ElementType; text: string; soft: string }> = {
  blood: { icon: Droplets, text: 'text-accent-red', soft: 'bg-accent-red/10' },
  beds: { icon: BedDouble, text: 'text-accent-blue', soft: 'bg-accent-blue/10' },
  ambulances: { icon: Ambulance, text: 'text-accent-green', soft: 'bg-accent-green/10' },
}

const AUDIENCE_ICONS = [Smartphone, Building2, Radio, Users]
const PILOTING_ICONS = [Activity, BrainCircuit, LockKeyhole]

const pillPrimary =
  'inline-flex items-center gap-2 rounded-full bg-brand font-semibold text-on-brand shadow-[0_10px_24px_-10px_var(--brand)] transition-colors hover:bg-brand-strong'
const pillOutline =
  'inline-flex items-center gap-2 rounded-full border border-fg/80 bg-transparent font-semibold text-fg transition-colors hover:bg-fg hover:text-canvas'

/** Titre de section : étiquette mono, titre serif avec un mot mis en valeur. */
const SectionTitle: React.FC<{
  label: string
  title: React.ReactNode
  intro?: string
  center?: boolean
  invert?: boolean
}> = ({ label, title, intro, center = false, invert = false }) => (
  <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
    <p className={`font-label text-xs font-semibold ${invert ? 'text-amber' : 'text-brand'}`}>{label}</p>
    <h2
      className={`font-display mt-3 text-4xl font-semibold leading-[1.1] sm:text-5xl ${invert ? 'text-white' : 'text-fg'}`}
    >
      {title}
    </h2>
    {intro && <p className={`mt-4 text-lg leading-relaxed ${invert ? 'text-white/75' : 'text-muted'}`}>{intro}</p>}
  </div>
)

/** Photo de la page (WebP, JPEG de secours). Crédits : public/images/landing/CREDITS.md. */
const Photo: React.FC<{ name: string; alt: string; eager?: boolean; className?: string }> = ({
  name,
  alt,
  eager = false,
  className = '',
}) => (
  <picture>
    <source srcSet={`/images/landing/${name}.webp`} type="image/webp" />
    <img
      src={`/images/landing/${name}.jpg`}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
    />
  </picture>
)

/** Alerte de don telle que le donneur la reçoit (décorative). */
const AlertCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    aria-hidden="true"
    className={`w-64 rounded-2xl border border-line bg-surface p-3.5 shadow-[var(--shadow-raised)] ${className}`}
  >
    <div className="flex items-center gap-2 text-2xs font-semibold text-brand">
      <Bell className="h-3.5 w-3.5" /> Jappo Dundu · maintenant
    </div>
    <p className="mt-1 text-sm font-semibold text-fg">Sang O− recherché à 2,4 km</p>
    <p className="text-xs text-muted">Hôpital Principal · 2 poches</p>
  </div>
)

/** Aperçu du produit (décoratif) : indicateurs et carte. */
const ProductPreview: React.FC = () => (
  <div aria-hidden="true" className="relative mx-auto w-full max-w-md">
    <div className="rounded-[2rem] border border-line bg-surface p-4 shadow-[var(--shadow-raised)]">
      <div className="mb-3 flex items-center gap-2 px-1">
        <BrandMark className="h-6 w-6" />
        <span className="text-xs font-semibold text-fg">Supervision nationale</span>
        <span className="ml-auto flex items-center gap-1 text-2xs font-semibold text-accent-green">
          <span className="live-pulse h-1.5 w-1.5 rounded-full bg-accent-green" /> Temps réel
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Lits libres', value: '78', icon: BedDouble, cls: 'text-accent-blue' },
          { label: 'Sang O−', value: '2', icon: Droplets, cls: 'text-accent-red' },
          { label: 'Ambulances', value: '4', icon: Ambulance, cls: 'text-accent-green' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl bg-raised p-3">
            <s.icon className={`h-4 w-4 ${s.cls}`} />
            <div className={`font-display mt-1 text-2xl font-semibold ${s.cls}`}>{s.value}</div>
            <div className="text-2xs text-muted">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="relative mt-2 h-40 overflow-hidden rounded-2xl bg-raised">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" preserveAspectRatio="none">
          <path
            d="M50 125 C 130 110, 160 55, 240 62 S 320 35, 350 28"
            fill="none"
            stroke="var(--accent-green)"
            strokeWidth="3"
            strokeDasharray="6 7"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute left-[10%] top-[72%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-green bg-surface">
          <Ambulance className="h-4 w-4 text-accent-green" />
        </span>
        <span className="absolute left-[84%] top-[8%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-blue bg-surface">
          <BedDouble className="h-4 w-4 text-accent-blue" />
        </span>
        <span className="absolute left-[48%] top-[30%] flex h-8 w-8 items-center justify-center rounded-full border-2 border-accent-red bg-surface">
          <Droplets className="h-4 w-4 text-accent-red" />
        </span>
      </div>
    </div>
  </div>
)

/**
 * Page d'accueil publique : présenter la plateforme (sang, lits, ambulances),
 * ses publics et le don de sang. Style « papier » (voir .landing dans index.css).
 */
export const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const spaceLink = isAuthenticated
    ? { to: '/', label: 'Mon espace', short: 'Mon espace' }
    : { to: '/login', label: 'Espace professionnel', short: 'Espace pro' }

  return (
    <div className="landing min-h-full overflow-x-hidden bg-canvas text-fg">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2"
      >
        Aller au contenu
      </a>

      {/* Navigation flottante */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <nav
          aria-label="Navigation principale"
          className="mx-auto flex max-w-6xl items-center gap-3 rounded-full border border-line bg-surface/90 py-2 pl-5 pr-2 shadow-[var(--shadow-panel)] backdrop-blur"
        >
          <a href="#haut" className="flex items-center gap-2">
            <BrandMark className="h-9 w-9" />
            <BrandName className="whitespace-nowrap text-base sm:text-lg" />
          </a>
          <ul className="mx-auto hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-full px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-fg"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            to={spaceLink.to}
            className={`${pillPrimary} ml-auto h-10 shrink-0 whitespace-nowrap px-4 text-sm lg:ml-0`}
          >
            <span className="sm:hidden">{spaceLink.short}</span>
            <span className="hidden sm:inline">{spaceLink.label}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="contenu">
        {/* Accroche */}
        <section id="haut" className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-amber-soft"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 pb-20 pt-14 lg:grid-cols-[1.1fr_0.9fr] lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-surface py-1 pl-1 pr-4 text-sm text-muted">
                <span className="font-label shrink-0 rounded-full bg-brand px-2.5 py-1 text-[0.65rem] font-semibold text-on-brand">
                  Temps réel
                </span>
                Sang, lits et ambulances sur une même plateforme
              </p>
              <h1 className="font-display mt-7 text-5xl font-semibold leading-[1.02] text-fg sm:text-6xl lg:text-7xl">
                Le sang, les lits et les ambulances, <span className="highlight">enfin connectés.</span>
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
                Jappo Dundu relie en temps réel les donneurs, les hôpitaux et le SAMU : l’ambulance la plus proche, le
                lit disponible et le donneur compatible, au même endroit.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#modules" className={`${pillPrimary} h-13 px-7 py-3.5 text-base`}>
                  <Plus className="h-5 w-5" aria-hidden="true" />
                  Découvrir les modules
                </a>
                <a href="#don" className={`${pillOutline} h-13 px-7 py-3.5 text-base`}>
                  Devenir donneur
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </a>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-md">
              <div className="aspect-[4/5] overflow-hidden rounded-[2.5rem] shadow-[var(--shadow-raised)]">
                <Photo
                  eager
                  name="alert"
                  alt="Une jeune femme souriante montre son téléphone"
                  className="object-[50%_20%]"
                />
              </div>
              <AlertCard className="absolute -left-4 bottom-10 sm:-left-12" />
              <span className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-accent-green shadow-[var(--shadow-panel)]">
                <span className="live-pulse h-1.5 w-1.5 rounded-full bg-accent-green" aria-hidden="true" /> Alerte en
                temps réel
              </span>
            </div>
          </div>

          {/* Bandeau défilant */}
          <div className="relative overflow-hidden bg-brand py-3.5 text-on-brand" aria-label="La plateforme en bref">
            <ul className="landing-ticker flex w-max gap-12 whitespace-nowrap text-sm">
              {[...TICKER, ...TICKER].map((item, index) => (
                <li key={index} className="flex items-center gap-2" aria-hidden={index >= TICKER.length}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/80" />
                  <strong className="font-bold">{item.strong}</strong> {item.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Repères */}
          <div className="relative mx-auto grid max-w-6xl grid-cols-2 gap-4 px-5 py-14 lg:grid-cols-4">
            {KEY_FIGURES.map((figure, index) => (
              <div
                key={figure.label}
                className={`rounded-full px-6 py-8 text-center ${index % 2 === 0 ? 'bg-raised' : 'bg-surface shadow-[var(--shadow-panel)]'}`}
              >
                <div className="font-display text-5xl font-semibold text-brand">{figure.value}</div>
                <div className="mx-auto mt-2 max-w-[12rem] text-sm leading-snug text-muted">{figure.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Modules */}
        <section id="modules" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
              <SectionTitle
                label="Trois modules, une seule plateforme"
                title={
                  <>
                    Tout ce qu’il faut pour <span className="highlight">gérer une urgence</span>
                  </>
                }
                intro="Chaque module fonctionne seul, et ils partagent les mêmes données : un lit libéré ou une ambulance disponible se voit partout, aussitôt."
              />
              <ProductPreview />
            </div>
            <div className="mt-14 grid gap-6 lg:grid-cols-3">
              {MODULES.map((module) => {
                const style = MODULE_STYLE[module.key]
                const Icon = style.icon
                return (
                  <article
                    key={module.key}
                    className="rounded-[2rem] border border-line bg-surface p-8 shadow-[var(--shadow-panel)]"
                  >
                    <span className={`flex h-14 w-14 items-center justify-center rounded-full ${style.soft}`}>
                      <Icon className={`h-7 w-7 ${style.text}`} aria-hidden="true" />
                    </span>
                    <h3 className="font-display mt-6 text-3xl font-semibold text-fg">{module.name}</h3>
                    <p className={`mt-1 text-base font-semibold italic ${style.text}`}>{module.tagline}</p>
                    <ul className="mt-6 space-y-3 border-t border-line pt-6">
                      {module.features.map((feature) => (
                        <li key={feature} className="flex gap-2.5 text-[0.9375rem] leading-relaxed text-muted">
                          <CheckCircle2 className={`mt-1 h-4 w-4 shrink-0 ${style.text}`} aria-hidden="true" />
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

        {/* Une urgence de bout en bout */}
        <section id="urgence" className="scroll-mt-24 bg-raised py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle
              label="Comment ça marche"
              title={
                <>
                  Une urgence, du premier appel <span className="highlight">au don de sang</span>
                </>
              }
              intro="Un accident sur la route : voici comment les trois modules se relaient."
            />
            <div className="mt-14 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
              <div className="relative min-h-80 overflow-hidden rounded-[2rem]">
                <Photo name="need" alt="Une ambulance en intervention de nuit" className="absolute inset-0" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-6 pt-20">
                  <p className="font-label text-[0.65rem] font-semibold text-amber">Chaque minute compte</p>
                  <p className="font-display mt-1 text-2xl font-semibold text-white">
                    25 minutes, trois modules, une seule chaîne de secours.
                  </p>
                </div>
              </div>
              <ol className="grid gap-4 sm:grid-cols-2">
                {SCENARIO.map((step, index) => {
                  const style = MODULE_STYLE[step.module]
                  const Icon = style.icon
                  return (
                    <li key={step.title} className="rounded-[1.75rem] bg-surface p-7 shadow-[var(--shadow-panel)]">
                      <div className="flex items-center justify-between">
                        <span className="font-display text-4xl font-semibold text-brand">{index + 1}</span>
                        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${style.soft}`}>
                          <Icon className={`h-5 w-5 ${style.text}`} aria-hidden="true" />
                        </span>
                      </div>
                      <p className="font-label mt-4 text-xs font-semibold text-subtle">T + {step.time}</p>
                      <h3 className="mt-1 text-lg font-bold text-fg">{step.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
                    </li>
                  )
                })}
              </ol>
            </div>
          </div>
        </section>

        {/* Publics */}
        <section id="publics" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle
              label="Pour qui ?"
              title={
                <>
                  Chacun son espace, <span className="highlight">chacun son rôle</span>
                </>
              }
              intro="Un administrateur par domaine : chacun ne voit que ce qui le concerne, pour son établissement."
            />
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map((audience, index) => {
                const Icon = AUDIENCE_ICONS[index]
                return (
                  <div key={audience.who} className="rounded-[1.75rem] border border-line bg-surface p-7">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-soft">
                      <Icon className="h-6 w-6 text-amber-ink" aria-hidden="true" />
                    </span>
                    <h3 className="font-display mt-5 text-2xl font-semibold text-fg">{audience.who}</h3>
                    <p className="font-label mt-1 text-[0.65rem] font-semibold text-brand">{audience.where}</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted">{audience.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Pilotage */}
        <section className="px-4">
          <div className="mx-auto max-w-6xl rounded-[2.5rem] bg-[#2e1e1d] px-6 py-16 sm:px-12">
            <SectionTitle
              invert
              label="Pilotage"
              title={
                <>
                  Voir, <span className="italic text-amber">anticiper</span>, protéger
                </>
              }
            />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {PILOTING.map((item, index) => {
                const Icon = PILOTING_ICONS[index]
                return (
                  <div key={item.title} className="rounded-[1.75rem] bg-white/6 p-7 ring-1 ring-white/10">
                    <Icon className="h-7 w-7 text-amber" aria-hidden="true" />
                    <h3 className="font-display mt-4 text-2xl font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/70">{item.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Don de sang */}
        <section id="don" className="scroll-mt-24 py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionTitle
                label="Don de sang"
                title={
                  <>
                    Un don peut sauver <span className="highlight">jusqu’à trois vies</span>
                  </>
                }
                intro="Avec l’application, vous êtes prévenu quand un hôpital proche a besoin de votre groupe sanguin."
              />
              <ul className="mt-8 space-y-3">
                {DONOR_CONDITIONS.map((condition) => (
                  <li key={condition} className="flex items-center gap-3 text-base text-fg">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-accent-green" aria-hidden="true" />
                    {condition}
                  </li>
                ))}
              </ul>
              <a
                href={SOURCE.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${pillOutline} mt-9 px-6 py-3 text-sm`}
              >
                Conditions complètes et lieux de don (CNTS)
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <div className="flex flex-col gap-6">
              <div className="rounded-[2rem] bg-raised p-8">
                <p className="font-label text-xs font-semibold text-brand">Groupes recherchés</p>
                <h3 className="font-display mt-2 text-3xl font-semibold text-fg">Votre groupe est-il attendu ?</h3>
                <p className="mt-1 text-sm text-muted">Selon le CNTS, au {BLOOD_NEEDS.updated}.</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {BLOOD_NEEDS.groups.map((g) => {
                    const critical = g.level === 'critical'
                    return (
                      <div key={g.group} className="flex items-center justify-between rounded-2xl bg-surface p-4">
                        <span className="font-display text-4xl font-semibold text-fg">{g.group}</span>
                        <span
                          className={`font-label rounded-full px-2.5 py-1 text-[0.6rem] font-semibold ${
                            critical ? 'bg-brand text-on-brand' : 'bg-amber-soft text-amber-ink'
                          }`}
                        >
                          {critical ? 'Critique' : 'En baisse'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface p-4">
                  <Smartphone className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
                  <p className="text-sm text-muted">L’application des donneurs arrive bientôt sur Android et iPhone.</p>
                </div>
              </div>
              <div className="aspect-[4/3] overflow-hidden rounded-[2rem]">
                <Photo name="donate" alt="Un bras pendant un don de sang" className="object-[50%_22%]" />
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 bg-raised py-20">
          <div className="mx-auto max-w-3xl px-5">
            <SectionTitle
              center
              label="Questions fréquentes"
              title={
                <>
                  Vous avez <span className="highlight">{'une question ?'}</span>
                </>
              }
            />
            <div className="mt-12 space-y-3">
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-3xl bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-7 py-5 text-base font-semibold text-fg [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-raised transition-transform group-open:rotate-45">
                      <Plus className="h-4 w-4 text-brand" aria-hidden="true" />
                    </span>
                  </summary>
                  <p className="px-7 pb-6 text-[0.9375rem] leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Appel final */}
        <section className="px-5 py-20">
          <div className="mx-auto mb-14 grid max-w-6xl items-center gap-10 rounded-[2.5rem] bg-raised p-6 sm:p-10 lg:grid-cols-2">
            <div className="aspect-[4/3] overflow-hidden rounded-[2rem]">
              <Photo name="impact" alt="Une mère tient son nouveau-né dans ses bras" className="object-[60%_45%]" />
            </div>
            <div>
              <p className="font-label text-xs font-semibold text-brand">Pourquoi Jappo Dundu</p>
              <p className="font-display mt-3 text-3xl font-semibold leading-tight text-fg sm:text-4xl">
                Derrière chaque alerte, <span className="highlight">une vie à sauver.</span>
              </p>
              <p className="mt-4 text-lg leading-relaxed text-muted">
                Une hémorragie après un accouchement, un accident de la route : quand le sang, le lit et l’ambulance
                arrivent à temps, une famille reste entière.
              </p>
            </div>
          </div>
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="font-display text-4xl font-semibold leading-tight text-fg sm:text-5xl">
              Votre établissement veut <span className="highlight">{'rejoindre le réseau ?'}</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
              Hôpitaux, centres de transfusion et services d’ambulances : connectez-vous à Jappo Dundu.
            </p>
            <Link to={spaceLink.to} className={`${pillPrimary} mt-9 px-8 py-4 text-base`}>
              {spaceLink.label}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      {/* Pied de page */}
      <footer className="px-4 pb-6">
        <div className="mx-auto max-w-6xl rounded-[2.5rem] bg-raised">
          <div className="grid gap-10 px-8 py-12 sm:px-12 md:grid-cols-[1.5fr_1fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <BrandMark className="h-10 w-10" />
                <BrandName className="text-xl" />
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
                « Connecter la vie » : la plateforme qui relie donneurs, hôpitaux et ambulances au Sénégal. Projet de
                fin d’études.
              </p>
            </div>
            <div>
              <h3 className="font-label text-xs font-semibold text-brand">Plateforme</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className="text-fg/80 hover:text-brand">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-label text-xs font-semibold text-brand">Accès</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                <li>
                  <Link to={spaceLink.to} className="text-fg/80 hover:text-brand">
                    {spaceLink.label}
                  </Link>
                </li>
                <li>
                  <a
                    href={SOURCE.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-fg/80 hover:text-brand"
                  >
                    Donner son sang (CNTS)
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-line px-8 py-5 sm:px-12">
            <p className="text-xs text-muted">
              <ShieldCheck className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
              Jappo Dundu n’est pas un service officiel du CNTS. Informations sur le don de sang issues de{' '}
              <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                cnts.gouv.sn
              </a>
              {`, consulté le ${SOURCE.consulted}. Photos : `}
              <a
                href="https://unsplash.com/license"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-fg"
              >
                Unsplash
              </a>
              .
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
