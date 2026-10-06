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
  ChevronDown,
  Droplets,
  ExternalLink,
  LockKeyhole,
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
  MODULES,
  PILOTING,
  SCENARIO,
  SOURCE,
  type ModuleKey,
} from './landing/content'

const NAV = [
  { href: '#modules', label: 'Modules' },
  { href: '#urgence', label: 'Comment ça marche' },
  { href: '#publics', label: 'Pour qui' },
  { href: '#don', label: 'Don de sang' },
  { href: '#faq', label: 'FAQ' },
]

/** Identité de chaque module : icône et couleur (mêmes accents que les tableaux de bord). */
const MODULE_STYLE: Record<ModuleKey, { icon: React.ElementType; text: string; soft: string; border: string }> = {
  blood: { icon: Droplets, text: 'text-accent-red', soft: 'bg-accent-red/10', border: 'border-t-accent-red' },
  beds: { icon: BedDouble, text: 'text-accent-blue', soft: 'bg-accent-blue/10', border: 'border-t-accent-blue' },
  ambulances: { icon: Ambulance, text: 'text-accent-green', soft: 'bg-accent-green/10', border: 'border-t-accent-green' },
}

const AUDIENCE_ICONS = [Smartphone, Building2, Radio, Users]
const PILOTING_ICONS = [Activity, BrainCircuit, LockKeyhole]

const SectionTitle: React.FC<{ eyebrow: string; title: string; intro?: string; center?: boolean }> = ({
  eyebrow,
  title,
  intro,
  center = false,
}) => (
  <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
    <p className="text-sm font-semibold text-brand">{eyebrow}</p>
    <h2 className="mt-2 text-3xl font-bold leading-tight text-fg sm:text-4xl">{title}</h2>
    {intro && <p className="mt-3 text-base leading-relaxed text-muted">{intro}</p>}
  </div>
)

/** Aperçu du produit (décoratif) : indicateurs, carte et alerte de don. */
const ProductPreview: React.FC = () => (
  <div aria-hidden="true" className="relative mx-auto w-full max-w-lg">
    <div className="rounded-3xl border border-line bg-surface p-4 shadow-[var(--shadow-raised)]">
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 text-xs font-medium text-subtle">Supervision nationale</span>
        <span className="ml-auto flex items-center gap-1 text-2xs font-medium text-ok">
          <span className="live-pulse h-1.5 w-1.5 rounded-full bg-ok" /> Temps réel
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Lits libres', value: '78', unit: '/ 423', cls: 'border-l-accent-blue', val: 'text-fg' },
          { label: 'Sang O−', value: '2', unit: 'demandes', cls: 'border-l-accent-red', val: 'text-accent-red' },
          { label: 'Ambulances', value: '4', unit: '/ 5', cls: 'border-l-accent-green', val: 'text-accent-green' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border border-line border-l-4 ${s.cls} bg-surface p-3`}>
            <div className="text-2xs text-muted">{s.label}</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className={`text-xl font-bold ${s.val}`}>{s.value}</span>
              <span className="text-2xs text-subtle">{s.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="relative mt-2 h-44 overflow-hidden rounded-xl bg-raised">
        <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:28px_28px]" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 176" preserveAspectRatio="none">
          <path
            d="M60 140 C 140 120, 170 60, 250 70 S 330 40, 350 30"
            fill="none"
            stroke="var(--accent-green)"
            strokeWidth="3"
            strokeDasharray="6 6"
          />
        </svg>
        <span className="absolute left-[13%] top-[74%] flex h-7 w-7 items-center justify-center rounded-lg border-2 border-accent-green bg-surface">
          <Ambulance className="h-4 w-4 text-accent-green" />
        </span>
        <span className="absolute left-[84%] top-[10%] flex h-7 w-7 items-center justify-center rounded-lg border-2 border-accent-blue bg-surface">
          <BedDouble className="h-4 w-4 text-accent-blue" />
        </span>
        <span className="absolute left-[48%] top-[30%] flex h-7 w-7 items-center justify-center rounded-lg border-2 border-accent-red bg-surface">
          <Droplets className="h-4 w-4 text-accent-red" />
        </span>
      </div>
    </div>
    <div className="absolute -bottom-8 right-2 w-64 rounded-2xl border border-line bg-surface p-3.5 shadow-[var(--shadow-raised)] sm:-right-8">
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
 * ses publics et le don de sang.
 */
export const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const spaceLink = isAuthenticated
    ? { to: '/', label: 'Mon espace', short: 'Mon espace' }
    : { to: '/login', label: 'Espace professionnel', short: 'Espace pro' }

  return (
    <div className="min-h-full bg-canvas text-fg">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        Aller au contenu
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur">
        <nav aria-label="Navigation principale" className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <a href="#haut" className="flex items-center gap-2">
            <BrandMark className="h-9 w-9" />
            <BrandName className="whitespace-nowrap text-base sm:text-lg" />
          </a>
          <ul className="ml-auto hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-fg"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            to={spaceLink.to}
            className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong lg:ml-2"
          >
            <span className="sm:hidden">{spaceLink.short}</span>
            <span className="hidden sm:inline">{spaceLink.label}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="contenu">
        {/* Accroche */}
        <section
          id="haut"
          className="mx-auto grid max-w-6xl items-center gap-16 px-5 pb-24 pt-14 lg:grid-cols-2 lg:pt-20"
        >
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm font-medium text-muted shadow-[var(--shadow-panel)]">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
              Plateforme d’urgences médicales · Sénégal
            </p>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] text-fg sm:text-5xl">
              Le sang, les lits et les ambulances, <span className="text-brand">enfin connectés.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Jappo Dundu relie en temps réel les donneurs, les hôpitaux et le SAMU : l’ambulance la plus proche, le
              lit disponible et le donneur compatible, au même endroit.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#modules"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-brand px-6 text-base font-semibold text-on-brand transition-colors hover:bg-brand-strong"
              >
                Découvrir les modules
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
              <a
                href="#don"
                className="inline-flex h-12 items-center gap-2 rounded-lg border border-line-strong bg-surface px-6 text-base font-semibold text-fg transition-colors hover:bg-raised"
              >
                <Droplets className="h-5 w-5 text-brand" aria-hidden="true" />
                Devenir donneur
              </a>
            </div>
            <p className="mt-6 text-sm font-semibold tracking-wide text-subtle">Connecter · Sauver · Vivre</p>
          </div>
          <ProductPreview />
        </section>

        {/* Modules */}
        <section id="modules" className="scroll-mt-20 border-y border-line bg-surface py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle
              eyebrow="Trois modules, une seule plateforme"
              title="Tout ce qu’il faut pour gérer une urgence"
              intro="Chaque module fonctionne seul, et ils partagent les mêmes données : un lit libéré ou une ambulance disponible se voit partout, aussitôt."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {MODULES.map((module) => {
                const style = MODULE_STYLE[module.key]
                const Icon = style.icon
                return (
                  <article key={module.key} className={`panel border-t-4 p-7 ${style.border}`}>
                    <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${style.soft}`}>
                      <Icon className={`h-6 w-6 ${style.text}`} aria-hidden="true" />
                    </span>
                    <h3 className="mt-5 text-xl font-bold text-fg">{module.name}</h3>
                    <p className={`mt-1 text-sm font-semibold ${style.text}`}>{module.tagline}</p>
                    <ul className="mt-5 space-y-3">
                      {module.features.map((feature) => (
                        <li key={feature} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                          <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${style.text}`} aria-hidden="true" />
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
        <section id="urgence" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <SectionTitle
            eyebrow="Comment ça marche"
            title="Une urgence, du premier appel au don de sang"
            intro="Un accident sur la route : voici comment les trois modules se relaient."
          />
          <ol className="relative mt-12 grid gap-8 md:grid-cols-4">
            <span aria-hidden="true" className="absolute left-0 right-0 top-6 hidden h-0.5 bg-line md:block" />
            {SCENARIO.map((step) => {
              const style = MODULE_STYLE[step.module]
              const Icon = style.icon
              return (
                <li key={step.title} className="relative">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-full border-4 border-canvas bg-surface shadow-[var(--shadow-panel)]">
                    <Icon className={`h-5 w-5 ${style.text}`} aria-hidden="true" />
                  </span>
                  <p className="num mt-4 text-sm font-bold text-subtle">{step.time}</p>
                  <h3 className="mt-1 text-lg font-bold text-fg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{step.text}</p>
                </li>
              )
            })}
          </ol>
        </section>

        {/* Publics */}
        <section id="publics" className="scroll-mt-20 border-y border-line bg-surface py-20">
          <div className="mx-auto max-w-6xl px-5">
            <SectionTitle
              eyebrow="Pour qui ?"
              title="Chacun son espace, chacun son rôle"
              intro="Un administrateur par domaine : chacun ne voit que ce qui le concerne, pour son établissement."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map((audience, index) => {
                const Icon = AUDIENCE_ICONS[index]
                return (
                  <div key={audience.who} className="rounded-2xl border border-line bg-canvas p-6">
                    <Icon className="h-7 w-7 text-fg" aria-hidden="true" />
                    <h3 className="mt-4 text-lg font-bold text-fg">{audience.who}</h3>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand">{audience.where}</p>
                    <p className="mt-3 text-sm leading-relaxed text-muted">{audience.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Pilotage */}
        <section className="bg-[#0f2547] py-20 text-white dark:bg-surface">
          <div className="mx-auto max-w-6xl px-5">
            <p className="text-sm font-semibold text-[#ff8a8f]">Pilotage</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">Voir, anticiper, protéger</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {PILOTING.map((item, index) => {
                const Icon = PILOTING_ICONS[index]
                return (
                  <div key={item.title} className="rounded-2xl bg-white/6 p-7 ring-1 ring-white/10">
                    <Icon className="h-7 w-7 text-[#ff8a8f]" aria-hidden="true" />
                    <h3 className="mt-4 text-lg font-bold">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/75">{item.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Don de sang */}
        <section id="don" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <SectionTitle
                eyebrow="Don de sang"
                title="Devenez donneur : un don peut sauver jusqu’à trois vies"
                intro="Avec l’application, vous êtes prévenu quand un hôpital proche a besoin de votre groupe sanguin."
              />
              <ul className="mt-8 space-y-3">
                {DONOR_CONDITIONS.map((condition) => (
                  <li key={condition} className="flex items-center gap-3 text-base text-fg">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
                    {condition}
                  </li>
                ))}
              </ul>
              <a
                href={SOURCE.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-strong"
              >
                Conditions complètes et lieux de don sur le site du CNTS
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <div className="panel p-7">
              <h3 className="text-lg font-bold text-fg">Groupes sanguins recherchés</h3>
              <p className="mt-1 text-sm text-muted">Selon le CNTS, au {BLOOD_NEEDS.updated}.</p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {BLOOD_NEEDS.groups.map((g) => {
                  const critical = g.level === 'critical'
                  return (
                    <div
                      key={g.group}
                      className={`flex items-center justify-between rounded-xl border border-l-4 border-line p-4 ${
                        critical ? 'border-l-critical' : 'border-l-accent-yellow'
                      }`}
                    >
                      <span className="text-3xl font-extrabold text-fg">{g.group}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          critical ? 'bg-critical text-white' : 'bg-warning/15 text-warning'
                        }`}
                      >
                        {critical ? 'Critique' : 'En baisse'}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="mt-6 flex items-center gap-3 rounded-xl bg-raised p-4">
                <Smartphone className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
                <p className="text-sm text-muted">L’application des donneurs arrive bientôt sur Android et iPhone.</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-line bg-surface py-20">
          <div className="mx-auto max-w-3xl px-5">
            <SectionTitle eyebrow="Questions fréquentes" title="Vous avez une question ?" center />
            <div className="mt-10 space-y-3">
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-xl border border-line bg-canvas">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 text-base font-semibold text-fg [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-muted transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="px-6 pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Appel final */}
        <section className="px-5 py-20">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 rounded-3xl bg-brand px-8 py-12 text-on-brand md:flex-row md:items-center md:px-12">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Votre établissement veut rejoindre Jappo Dundu ?</h2>
              <p className="mt-2 text-white/85">
                Hôpitaux, centres de transfusion et services d’ambulances : connectez-vous au réseau.
              </p>
            </div>
            <Link
              to={spaceLink.to}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-lg bg-white px-6 text-base font-semibold text-brand hover:bg-white/90"
            >
              {spaceLink.label}
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <BrandMark className="h-9 w-9" />
              <BrandName className="text-lg" />
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              « Connecter la vie » : la plateforme qui relie donneurs, hôpitaux et ambulances au Sénégal. Projet de
              fin d’études.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">Plateforme</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-muted hover:text-fg">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-fg">Accès</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link to={spaceLink.to} className="text-muted hover:text-fg">
                  {spaceLink.label}
                </Link>
              </li>
              <li>
                <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className="text-muted hover:text-fg">
                  Donner son sang (CNTS)
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-subtle">
            <ShieldCheck className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
            Jappo Dundu n’est pas un service officiel du CNTS. Informations sur le don de sang issues de{' '}
            <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
              cnts.gouv.sn
            </a>
            {`, consulté le ${SOURCE.consulted}.`}
          </p>
        </div>
      </footer>
    </div>
  )
}
