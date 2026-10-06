import React from 'react'
import { Link } from 'react-router'
import {
  ArrowRight,
  Ambulance,
  BedDouble,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  Droplets,
  HeartHandshake,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { BrandLogo, BrandMark, BrandName } from '@/components/layout/BrandMark'
import {
  ADVICE,
  BLOOD_NEEDS,
  ELIGIBILITY,
  FAQ,
  JOURNEY,
  KEY_FIGURES,
  PLATFORM,
  PRODUCTS,
  SITES,
  SOURCE,
  TICKER,
} from './landing/content'

const NAV = [
  { href: '#besoins', label: 'Besoins' },
  { href: '#qui-peut-donner', label: 'Qui peut donner' },
  { href: '#parcours', label: 'Le don' },
  { href: '#ou-donner', label: 'Où donner' },
  { href: '#faq', label: 'FAQ' },
]

const PLATFORM_ICONS = [Droplets, BedDouble, Ambulance]

/** Titre de section : sur-titre rouge, titre, introduction. */
const SectionTitle: React.FC<{ eyebrow: string; title: string; intro?: string; center?: boolean }> = ({
  eyebrow,
  title,
  intro,
  center = false,
}) => (
  <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
    <p className="text-sm font-semibold uppercase tracking-wider text-brand">{eyebrow}</p>
    <h2 className="mt-2 text-3xl font-bold leading-tight text-fg sm:text-4xl">{title}</h2>
    {intro && <p className="mt-3 text-base leading-relaxed text-muted">{intro}</p>}
  </div>
)

/** Itinéraire vers un site (OpenStreetMap, sans compte ni clé). */
const directionsUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}#map=15/${lat}/${lng}`

/**
 * Page d'accueil publique : informer et donner envie de donner.
 * Informations issues du site du CNTS (voir landing/content.ts).
 */
export const Landing: React.FC = () => {
  const { isAuthenticated } = useAuth()
  const spaceLink = isAuthenticated
    ? { to: '/', label: 'Mon espace', short: 'Mon espace' }
    : { to: '/login', label: 'Espace professionnel', short: 'Espace pro' }

  return (
    <div className="min-h-full bg-[#fbf7f2] text-fg dark:bg-canvas">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        Aller au contenu
      </a>

      {/* Bandeau de contact */}
      <div className="hidden border-b border-line/70 bg-surface/60 text-xs text-muted md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-2">
          <span className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" /> CNTS : +221 33 815 17 62
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Fann-Résidence, Dakar
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> Lun–ven 8 h–17 h · Sam 8 h–13 h
          </span>
        </div>
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-40 px-4 pt-3">
        <nav
          aria-label="Navigation principale"
          className="mx-auto flex max-w-6xl items-center gap-4 rounded-full border border-line bg-surface/90 py-2 pl-4 pr-2 shadow-[var(--shadow-panel)] backdrop-blur"
        >
          <a href="#haut" className="flex items-center gap-2">
            <BrandMark className="h-9 w-9" />
            <BrandName className="whitespace-nowrap text-base sm:text-lg" />
          </a>
          <ul className="ml-auto hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="rounded-full px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-fg"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            to={spaceLink.to}
            className="ml-auto inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-brand px-4 text-sm font-semibold text-on-brand shadow-[0_4px_12px_-2px_color-mix(in_oklab,var(--brand)_45%,transparent)] transition-colors hover:bg-brand-strong lg:ml-2"
          >
            <span className="sm:hidden">{spaceLink.short}</span>
            <span className="hidden sm:inline">{spaceLink.label}</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="contenu">
        {/* Accueil */}
        <section id="haut" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 -top-24 h-[28rem] w-[28rem] rounded-full bg-[#fde3c2] opacity-70 blur-0 dark:bg-brand-soft"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-14 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-surface px-1.5 py-1 pr-4 text-sm text-muted">
                <span className="shrink-0 whitespace-nowrap rounded-full bg-brand px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider text-on-brand">
                  Besoin constant
                </span>
                Les réserves se renouvellent en permanence : chaque don compte.
              </p>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] text-fg sm:text-5xl lg:text-6xl">
                Donner son sang,
                <br />
                c’est{' '}
                <span className="italic text-brand [background:linear-gradient(transparent_62%,#fcd9a8_62%)] dark:[background:none]">
                  sauver des vies.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                Un don prend 45 minutes et peut sauver jusqu’à trois personnes : accidentés, mères qui accouchent,
                enfants malades. Jappo Dundu vous prévient quand un hôpital proche a besoin de votre groupe sanguin.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#qui-peut-donner"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 text-base font-semibold text-on-brand shadow-[0_8px_20px_-6px_color-mix(in_oklab,var(--brand)_55%,transparent)] transition-colors hover:bg-brand-strong"
                >
                  <Droplets className="h-5 w-5" aria-hidden="true" />
                  Je veux donner
                </a>
                <a
                  href="#application"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-surface px-6 text-base font-semibold text-fg transition-colors hover:bg-raised"
                >
                  <Smartphone className="h-5 w-5" aria-hidden="true" />
                  L’application
                </a>
              </div>
            </div>
            <div className="hidden justify-center lg:flex">
              <div className="rounded-[2.5rem] bg-surface p-10 shadow-[var(--shadow-raised)]">
                <BrandLogo className="h-64 w-auto" />
              </div>
            </div>
          </div>

          {/* Bandeau défilant */}
          <div className="overflow-hidden bg-brand py-3 text-on-brand" aria-label="Informations essentielles">
            <ul className="landing-ticker flex w-max gap-12 whitespace-nowrap text-sm">
              {[...TICKER, ...TICKER].map((item, index) => (
                <li key={index} className="flex items-center gap-2" aria-hidden={index >= TICKER.length}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white/80" />
                  <strong className="font-bold">{item.strong}</strong> {item.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Chiffres clés */}
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-6 py-12 lg:grid-cols-4">
            {KEY_FIGURES.map((figure) => (
              <div key={figure.label} className="rounded-3xl bg-surface px-6 py-7 text-center shadow-[var(--shadow-panel)]">
                <div className="num whitespace-nowrap text-3xl font-extrabold text-brand sm:text-4xl">{figure.value}</div>
                <div className="mt-2 text-sm leading-snug text-muted">{figure.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Besoins */}
        <section id="besoins" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
          <SectionTitle
            eyebrow="Besoins actuels"
            title="Ces groupes sanguins sont attendus"
            intro={`Vous êtes O−, B−, A+ ou A− ? Votre don est particulièrement attendu. État publié par le CNTS le ${BLOOD_NEEDS.updated}.`}
          />
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {BLOOD_NEEDS.groups.map((g) => {
              const critical = g.level === 'critical'
              return (
                <div
                  key={g.group}
                  className={`panel border-l-4 p-6 ${critical ? 'border-l-critical' : 'border-l-accent-yellow'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-fg">{g.group}</span>
                    <Droplets className={`h-7 w-7 ${critical ? 'text-critical' : 'text-warning'}`} aria-hidden="true" />
                  </div>
                  <span
                    className={`mt-4 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      critical ? 'bg-critical text-white' : 'bg-warning/15 text-warning'
                    }`}
                  >
                    {critical ? 'Critique' : 'En baisse'}
                  </span>
                  <p className="mt-2 text-sm text-muted">{g.note}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Qui peut donner */}
        <section id="qui-peut-donner" className="scroll-mt-24 bg-surface py-16">
          <div className="mx-auto max-w-6xl px-6">
            <SectionTitle
              eyebrow="Qui peut donner ?"
              title="Êtes-vous prêt à donner ?"
              intro="Vérifiez en quelques secondes les conditions fixées par le CNTS."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ELIGIBILITY.criteria.map((c) => (
                <div key={c.title} className="rounded-2xl border border-line bg-canvas p-6">
                  <CheckCircle2 className="h-7 w-7 text-ok" aria-hidden="true" />
                  <h3 className="mt-4 text-lg font-bold text-fg">{c.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{c.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 grid gap-6 rounded-3xl bg-brand-soft p-8 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <div className="flex items-center gap-2 text-brand">
                  <TriangleAlert className="h-5 w-5" aria-hidden="true" />
                  <h3 className="text-lg font-bold">Attendez avant de donner si…</h3>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{ELIGIBILITY.note}</p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {ELIGIBILITY.postpone.map((item) => (
                  <li key={item} className="flex items-start gap-2 rounded-xl bg-surface px-4 py-3 text-sm text-fg">
                    <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Parcours */}
        <section id="parcours" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
          <SectionTitle
            eyebrow="Le jour du don"
            title="45 minutes, en 4 étapes"
            intro="De l’accueil à la collation, une équipe vous accompagne à chaque instant."
          />
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {JOURNEY.map((j, index) => (
              <li key={j.step} className="panel relative p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-lg font-bold text-on-brand">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg font-bold text-fg">{j.step}</h3>
                <p className="mt-0.5 text-sm font-semibold text-brand">{j.duration}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{j.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {ADVICE.map((a) => (
              <div key={a.when} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="text-base font-bold text-fg">{a.when} le don</h3>
                <ul className="mt-3 space-y-2">
                  {a.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-muted">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Produits */}
        <section className="bg-surface py-16">
          <div className="mx-auto max-w-6xl px-6">
            <SectionTitle
              eyebrow="Après le don"
              title="Que devient votre sang ?"
              intro="Il est analysé (groupe, VIH, hépatites, syphilis), puis séparé en composants livrés chaque jour aux hôpitaux du pays."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PRODUCTS.map((p) => (
                <div key={p.name} className="rounded-2xl border border-line bg-canvas p-6">
                  <h3 className="text-lg font-bold text-fg">{p.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-brand">Se conserve {p.keeps}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{p.use}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Où donner */}
        <section id="ou-donner" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16">
          <SectionTitle
            eyebrow="Où donner ?"
            title="Les sites de don"
            intro="Le réseau national compte 33 structures dans les 14 régions. Des collectes mobiles passent aussi dans les entreprises, administrations et universités."
          />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {SITES.map((site) => (
              <article key={site.name} className="panel flex flex-col p-6">
                <MapPin className="h-6 w-6 text-brand" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-bold text-fg">{site.name}</h3>
                <p className="text-sm font-medium text-muted">{site.city}</p>
                <p className="mt-3 text-sm text-fg">{site.address}</p>
                <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {site.hours}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-5">
                  <a
                    href={directionsUrl(site.lat, site.lng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong"
                  >
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    Itinéraire
                  </a>
                  <a
                    href={`tel:${site.phone.replace(/\s/g, '')}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold text-fg hover:bg-raised"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    Appeler
                  </a>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            Le CNTS ne propose pas encore de rendez-vous en ligne : appelez le +221 33 815 17 62 ou présentez-vous
            directement aux horaires d’ouverture.
          </p>
        </section>

        {/* Jappo Dundu */}
        <section id="application" className="scroll-mt-24 bg-[#0f2547] py-16 text-white dark:bg-surface">
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#ff8a8f]">La plateforme</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
              Jappo Dundu connecte donneurs, hôpitaux et ambulances
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/75">
              « Connecter • Sauver • Vivre » : une plateforme pour que le sang, les lits et les secours arrivent au
              bon endroit, au bon moment.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {PLATFORM.map((module, index) => {
                const Icon = PLATFORM_ICONS[index]
                return (
                  <div key={module.name} className="rounded-2xl bg-white/8 p-6 ring-1 ring-white/10">
                    <Icon className="h-7 w-7 text-[#ff8a8f]" aria-hidden="true" />
                    <h3 className="mt-4 text-lg font-bold">{module.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/75">{module.text}</p>
                  </div>
                )
              })}
            </div>
            <div className="mt-10 flex flex-col gap-4 rounded-3xl bg-white/8 p-8 ring-1 ring-white/10 md:flex-row md:items-center">
              <Smartphone className="h-10 w-10 shrink-0 text-[#ff8a8f]" aria-hidden="true" />
              <div className="flex-1">
                <h3 className="text-xl font-bold">L’application des donneurs</h3>
                <p className="mt-1 text-sm text-white/75">
                  Recevez les alertes des hôpitaux proches qui ont besoin de votre groupe, répondez en un geste et
                  suivez vos dons. Bientôt sur Android et iPhone.
                </p>
              </div>
              <span className="inline-flex h-11 items-center rounded-full bg-white/12 px-5 text-sm font-semibold">
                Bientôt disponible
              </span>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 py-16">
          <SectionTitle eyebrow="Questions fréquentes" title="Vous avez une question ?" center />
          <div className="mt-10 space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="panel group p-0">
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
        </section>

        {/* Appel final */}
        <section className="px-6 pb-16">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 rounded-[2rem] bg-brand px-8 py-14 text-center text-on-brand shadow-[var(--shadow-raised)]">
            <HeartHandshake className="h-12 w-12" aria-hidden="true" />
            <h2 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
              Quelqu’un, quelque part au Sénégal, attend votre don.
            </h2>
            <p className="max-w-xl text-base text-white/85">
              Rendez-vous au CNTS de Fann ou dans le centre le plus proche. 45 minutes suffisent.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="#ou-donner"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-base font-semibold text-brand hover:bg-white/90"
              >
                <MapPin className="h-5 w-5" aria-hidden="true" />
                Trouver un site
              </a>
              <a
                href="tel:+221338151762"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/50 px-6 text-base font-semibold hover:bg-white/10"
              >
                <Phone className="h-5 w-5" aria-hidden="true" />
                +221 33 815 17 62
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Pied de page */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <BrandMark className="h-9 w-9" />
              <BrandName className="text-lg" />
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              Plateforme de régulation des urgences médicales au Sénégal : sang, lits et ambulances. Projet de fin
              d’études.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-brand">Donner son sang</h3>
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
            <h3 className="text-sm font-semibold uppercase tracking-wider text-brand">Contacter le CNTS</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li>Avenue Cheikh Anta Diop, Fann-Résidence, Dakar</li>
              <li>BP 5002, Dakar</li>
              <li>
                <a href="tel:+221338151762" className="hover:text-fg">
                  +221 33 815 17 62
                </a>
              </li>
              <li>
                <a href="mailto:communication@cnts.gouv.sn" className="hover:text-fg">
                  communication@cnts.gouv.sn
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-5 text-xs text-subtle md:flex-row md:items-center md:justify-between">
            <p>
              <ShieldCheck className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden="true" />
              Jappo Dundu n’est pas un service officiel du CNTS. Informations issues de{' '}
              <a href={SOURCE.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-fg">
                cnts.gouv.sn
              </a>
              {`, consulté le ${SOURCE.consulted}.`}
            </p>
            <Link to={spaceLink.to} className="font-medium text-muted hover:text-fg">
              {spaceLink.label}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
