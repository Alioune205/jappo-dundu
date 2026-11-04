/**
 * Aperçus d'interface de la page d'accueil : tableau de bord, mission SAMU et
 * alerte de l'application donneurs.
 *
 * Ce sont des illustrations : leurs valeurs sont des exemples, signalés comme
 * tels sous l'aperçu du tableau de bord. Elles reprennent la grammaire de
 * l'application (encre pour le nominal, couleur pour l'exception, hachures
 * pour ce qui reste disponible) avec les couleurs du thème clair : l'accueil
 * ne passe pas en sombre.
 */
import React, { useLayoutEffect, useRef } from 'react'
import {
  Ambulance,
  ArrowRight,
  ArrowUpRight,
  BatteryFull,
  BedDouble,
  Bell,
  BrainCircuit,
  Building2,
  Check,
  Droplets,
  HeartPulse,
  LayoutDashboard,
  MapPin,
  Signal,
  Wifi,
} from 'lucide-react'
import { JappoEmblem } from '@/components/ai/JappoEmblem'

/** Rang d'un élément dans une cascade d'apparition (voir index.css). */
const delay = (g: number) => ({ '--g': g }) as React.CSSProperties

/* -------------------------------------------------------------------------- */
/* Tableau de bord                                                            */
/* -------------------------------------------------------------------------- */

/** Dimensions de dessin de l'aperçu ; il est réduit pour tenir dans les écrans plus étroits. */
const MOCK_WIDTH = 1100
const MOCK_HEIGHT = 590
const THRESHOLD = 85

const SERVICES = [
  { name: 'Urgences', rate: 46 },
  { name: 'Réanimation', rate: 92 },
  { name: 'Chirurgie', rate: 84 },
  { name: 'Médecine', rate: 76 },
  { name: 'Maternité', rate: 58 },
  { name: 'Pédiatrie', rate: 40 },
]

const occupancyTone = (rate: number) => (rate > THRESHOLD ? 'bg-[#d92d20]' : rate > 70 ? 'bg-[#dc6803]' : 'bg-[#0f2547]')

const PRIORITIES = [
  { tone: 'bg-[#d92d20]', title: 'Réanimation saturée', meta: 'Kaolack · tous les lits sont occupés', when: '2 min' },
  { tone: 'bg-[#d92d20]', title: 'Stock O− sous le seuil', meta: 'Région de Dakar · donneurs alertés', when: '6 min' },
  { tone: 'bg-[#dc6803]', title: 'Mission vitale en route', meta: 'Pikine · ambulance affectée', when: '9 min' },
]

const SIDEBAR = [
  { section: 'Supervision', items: [{ label: 'Tableau de bord', icon: LayoutDashboard, active: true }] },
  {
    section: 'Ressources',
    items: [
      { label: 'Banque de sang', icon: Droplets },
      { label: 'Lits', icon: BedDouble },
      { label: 'Flotte SAMU', icon: Ambulance },
    ],
  },
  {
    section: 'Pilotage',
    items: [
      { label: 'Prévisions de pénurie', icon: BrainCircuit },
      { label: 'Structures', icon: Building2 },
    ],
  },
]

/** Réglette sous un chiffre : un segment par unité, plein = engagé, haché = disponible. */
const Segments: React.FC<{ tones: string[] }> = ({ tones }) => (
  <div className="mt-3 flex h-[7px] gap-[3px]">
    {tones.map((tone, k) => (
      <span key={k} className={`flex-1 rounded-full ${tone}`} />
    ))}
  </div>
)

const Tile: React.FC<{ label: string; value: string; unit?: string; note: string; dot: string; children: React.ReactNode }> = ({
  label,
  value,
  unit,
  note,
  dot,
  children,
}) => (
  <div className="rounded-[14px] border border-[#e4e7ec] bg-white p-3.5">
    <p className="text-[11.5px] text-[#5a6578]">{label}</p>
    <p className="mt-1.5 flex items-baseline gap-1.5">
      <span className="text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{value}</span>
      {unit && <span className="text-[12px] text-[#8a94a6]">{unit}</span>}
    </p>
    {children}
    <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] font-medium text-[#3b4658]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {note}
    </p>
  </div>
)

const DashboardMockup: React.FC = () => (
  <div
    className="flex flex-col overflow-hidden rounded-t-[20px] bg-[#e8ebf0] text-[#0b1a30] ring-1 ring-white/15"
    style={{ width: MOCK_WIDTH, height: MOCK_HEIGHT }}
  >
    {/* Barre de fenêtre */}
    <div className="flex h-10 shrink-0 items-center px-4">
      <span className="flex w-12 gap-1.5">
        {[0, 1, 2].map((k) => (
          <span key={k} className="h-2.5 w-2.5 rounded-full bg-[#c4cad4]" />
        ))}
      </span>
      <span className="mx-auto rounded-md bg-white/75 px-16 py-1 text-[11px] text-[#5a6578]">Jappo Dundu · Tableau de bord</span>
      <span className="w-12" />
    </div>

    <div className="grid min-h-0 flex-1 grid-cols-[212px_minmax(0,1fr)]">
      {/* Barre latérale */}
      <div className="flex min-h-0 flex-col px-3 pb-4">
        <div className="flex items-center gap-2.5 px-2 pb-2 pt-1.5">
          <img src="/logo-mark.png" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <b className="block text-[14px] font-semibold tracking-[-0.01em]">
              Jappo <span className="text-[#e4151e]">Dundu</span>
            </b>
            <small className="block text-[10.5px] text-[#5a6578]">Supervision nationale</small>
          </div>
        </div>
        {SIDEBAR.map((group) => (
          <div key={group.section} className="mt-4">
            <p className="px-2.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[#8a94a6]">{group.section}</p>
            <ul className="mt-1.5 space-y-0.5">
              {group.items.map((item) => (
                <li
                  key={item.label}
                  className={`relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[12px] ${
                    'active' in item ? 'bg-white font-semibold shadow-[0_1px_2px_rgb(15_37_71/0.08)]' : 'text-[#3b4658]'
                  }`}
                >
                  {'active' in item && <span className="absolute -left-3 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r bg-[#0f2547]" />}
                  <item.icon className="h-[15px] w-[15px]" strokeWidth={1.8} />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="mt-auto rounded-[14px] bg-[#0f2547] p-3 text-white">
          <div className="flex items-center justify-between">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">
              <JappoEmblem className="h-4 w-4" pulseClassName="text-[#ff7b80]" />
            </span>
            <span className="rounded-md border border-white/20 px-1.5 py-0.5 text-[9px] text-white/70">Ctrl K</span>
          </div>
          <b className="mt-2 block text-[12px] font-semibold">Jappo IA</b>
          <p className="mt-0.5 text-[10px] leading-snug text-white/70">Une question sur les lits, le sang ou le SAMU ?</p>
        </div>
      </div>

      {/* Feuille de contenu */}
      <div className="min-h-0 overflow-hidden rounded-tl-[16px] bg-[#f4f6f9]">
        <div className="flex h-12 items-center gap-3 border-b border-[#e4e7ec] px-6 text-[12px]">
          <b className="font-semibold">Tableau de bord</b>
          <span className="h-3.5 w-px bg-[#d0d5dd]" />
          <span className="text-[#5a6578]">Réseau national</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-[#e4e7ec] bg-white px-2.5 py-1 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#12a150]" /> Temps réel
          </span>
          <Bell className="h-4 w-4 text-[#5a6578]" strokeWidth={1.8} />
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[#0f2547] text-[11px] font-semibold text-white">A</span>
        </div>

        <div className="px-6 pt-5">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#8a94a6]">Supervision · Réseau national</p>
          <p className="mt-1 text-[24px] font-semibold leading-tight tracking-[-0.03em]">Vue réseau</p>
          <p className="mt-0.5 text-[11.5px] text-[#5a6578]">Lits, sang et ambulances de toutes les structures, en temps réel.</p>

          <div className="mt-4 grid grid-cols-4 gap-3">
            <div className="rounded-[14px] bg-[#0f2547] p-3.5 text-white shadow-[0_8px_18px_rgb(15_37_71/0.25)]">
              <p className="flex items-center justify-between text-[11.5px] text-white/80">
                Lits libres
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/10">
                  <ArrowUpRight className="h-3 w-3" />
                </span>
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums">71</span>
                <span className="text-[12px] text-white/60">/ 240</span>
              </p>
              <div className="mt-3 flex h-[7px] overflow-hidden rounded-full">
                <span className="grow-x h-full w-[70%] rounded-full bg-[#fdc254]" />
                <span className="mock-hatch-ink h-full flex-1" />
              </div>
              <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[#fdc254]" /> 70 % d’occupation
              </p>
            </div>
            <Tile label="Poches disponibles" value="412" unit="poches" note="2 groupes sous le seuil" dot="bg-[#d92d20]">
              <Segments tones={['bg-[#0f2547]', 'bg-[#d92d20]', 'bg-[#0f2547]', 'bg-[#0f2547]', 'bg-[#0f2547]', 'bg-[#d92d20]', 'bg-[#0f2547]', 'bg-[#0f2547]']} />
            </Tile>
            <Tile label="Ambulances disponibles" value="9" unit="/ 14" note="5 en mission" dot="bg-[#0f2547]">
              <Segments tones={Array.from({ length: 14 }, (_, k) => (k < 5 ? 'bg-[#0f2547]' : 'mock-hatch bg-[#eef1f5]'))} />
            </Tile>
            <Tile label="Alertes actives" value="3" note="1 vitale · 2 urgentes" dot="bg-[#d92d20]">
              <Segments tones={['bg-[#d92d20]', 'bg-[#dc6803]', 'bg-[#dc6803]']} />
            </Tile>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-3">
            <div className="rounded-[14px] border border-[#e4e7ec] bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-semibold">Occupation par service</p>
                  <p className="text-[10.5px] text-[#5a6578]">Part des lits occupés · le trait marque le seuil de {THRESHOLD} %</p>
                </div>
                <span className="flex rounded-full bg-[#eef1f5] p-0.5 text-[10.5px]">
                  <span className="rounded-full bg-white px-2.5 py-0.5 font-medium shadow-[0_1px_2px_rgb(15_37_71/0.1)]">Taux</span>
                  <span className="px-2.5 py-0.5 text-[#5a6578]">Volumes</span>
                </span>
              </div>
              <div className="relative mt-4 flex h-[140px] items-end justify-around pr-12">
                {SERVICES.map((s, k) => (
                  <div key={s.name} className="mock-hatch relative h-full w-9 overflow-hidden rounded-full bg-[#f6f7f9] ring-1 ring-inset ring-[#e4e7ec]">
                    <span
                      className={`grow-y absolute inset-x-0 bottom-0 rounded-full ${occupancyTone(s.rate)}`}
                      style={{ height: `${s.rate}%`, ...delay(k) }}
                    />
                  </div>
                ))}
                <span className="absolute left-0 right-12 border-t border-dashed border-[#d92d20]/70" style={{ bottom: `${THRESHOLD}%` }} />
                <span className="absolute right-0 text-[9.5px] font-medium text-[#d92d20]" style={{ bottom: `calc(${THRESHOLD}% - 6px)` }}>
                  Seuil {THRESHOLD} %
                </span>
              </div>
              <div className="mt-2 flex justify-around pr-12 text-center">
                {SERVICES.map((s) => (
                  <div key={s.name} className="w-16">
                    <p className="text-[10.5px] font-medium">{s.name}</p>
                    <p className="text-[10px] tabular-nums text-[#8a94a6]">{s.rate} %</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[14px] border border-[#e4e7ec] bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">Priorités</p>
                <span className="rounded-full bg-[#fdecea] px-2 py-0.5 text-[10px] font-semibold text-[#b42318]">3 à traiter</span>
              </div>
              <ul className="mt-3 space-y-2">
                {PRIORITIES.map((p, k) => (
                  <li key={p.title} className="pop-in flex gap-2.5 rounded-[10px] border border-[#eef0f3] p-2.5" style={delay(k)}>
                    <span className={`w-[3px] shrink-0 rounded-full ${p.tone}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-semibold">{p.title}</p>
                      <p className="truncate text-[10px] text-[#5a6578]">{p.meta}</p>
                    </div>
                    <span className="text-[9.5px] text-[#8a94a6]">{p.when}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Le tableau continue sous le bord de la scène. */}
          <div className="mt-3 rounded-[14px] border border-[#e4e7ec] bg-white p-4">
            <p className="text-[13px] font-semibold">Stocks par groupe sanguin</p>
            <p className="text-[10.5px] text-[#5a6578]">Poches disponibles · couleur = risque de pénurie à 7 jours</p>
          </div>
        </div>
      </div>
    </div>
  </div>
)

/** Réduit l'aperçu (variable CSS --fit) pour qu'il tienne dans la largeur disponible. */
function useFitScale(designWidth: number) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver !== 'function') return
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      if (width > 0) el.style.setProperty('--fit', String(Math.min(1, width / designWidth)))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [designWidth])
  return ref
}

/** Jappo IA répond : question, réponse, sources. */
const AssistantBubble: React.FC = () => (
  <div className="rounded-[1.25rem] bg-white p-4 text-[#0b1a30] shadow-[0_30px_60px_rgb(0_6_20/0.45)]">
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#0f2547] text-white">
        <JappoEmblem className="h-[18px] w-[18px]" pulseClassName="text-[#ff7b80]" />
      </span>
      <div className="leading-tight">
        <b className="block text-[13px] font-semibold">Jappo IA</b>
        <small className="text-[11px] text-[#5a6578]">Répond à partir de vos données</small>
      </div>
    </div>
    <p className="ml-auto mt-3.5 w-fit max-w-[88%] rounded-[14px] rounded-br-[4px] bg-[#0f2547] px-3 py-2 text-[12px] leading-snug text-white">
      Où trouver un lit de réanimation près de Kaolack ?
    </p>
    <div className="mt-2.5 max-w-[92%] rounded-[14px] rounded-bl-[4px] bg-[#f1f4f8] px-3 py-2.5 text-[12px] leading-snug">
      <b className="font-semibold">Thiès</b> a un lit de réanimation libre, signalé il y a 3 min.
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-[#5a6578]">
        <span className="rounded-full border border-[#e4e7ec] bg-white px-2 py-0.5">Source : Jappo Lits</span>
        <span className="rounded-full border border-[#e4e7ec] bg-white px-2 py-0.5">Données à jour</span>
      </div>
    </div>
  </div>
)

/** Une mise à jour arrive en temps réel. */
const LiveToast: React.FC = () => (
  <div className="flex items-start gap-3 rounded-[1.1rem] bg-white p-3.5 text-[#0b1a30] shadow-[0_30px_60px_rgb(0_6_20/0.45)]">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e6f4ec] text-[#067647]">
      <BedDouble className="h-[18px] w-[18px]" />
    </span>
    <div className="min-w-0 flex-1">
      <p className="flex items-center justify-between gap-2 text-[12.5px] font-semibold">
        Lit libéré · Réanimation
        <span className="text-[10px] font-normal text-[#8a94a6]">à l’instant</span>
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-[#5a6578]">Thiès · visible aussitôt par le SAMU et les hôpitaux voisins.</p>
    </div>
  </div>
)

/**
 * Scène produit : le tableau de bord sort d'un fond d'encre, accompagné d'une
 * mise à jour en temps réel et d'une réponse de Jappo IA.
 */
export const PlatformStage: React.FC = () => {
  const fitRef = useFitScale(MOCK_WIDTH)
  return (
    <figure>
      <div
        data-reveal
        className="relative isolate overflow-hidden rounded-[2rem] bg-[#031632] px-4 pt-10 sm:px-8 sm:pt-14 lg:px-12 lg:pt-16 xl:px-24 xl:pt-20"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(55%_65%_at_50%_0%,rgb(46_108_222/0.42),transparent_72%),radial-gradient(35%_45%_at_100%_100%,rgb(242_11_43/0.16),transparent_70%)]"
        />
        <div aria-hidden="true" className="stage-grid absolute inset-0 -z-10" />
        <div
          ref={fitRef}
          role="img"
          aria-label="Aperçu du tableau de bord de supervision : lits libres, poches de sang, ambulances disponibles, occupation par service et priorités du moment."
          className="relative mx-auto w-full max-w-[1100px]"
          style={{ height: `calc(${MOCK_HEIGHT}px * var(--fit, 1))` }}
        >
          <div aria-hidden="true" className="absolute left-0 top-0 origin-top-left" style={{ transform: 'scale(var(--fit, 1))' }}>
            <DashboardMockup />
          </div>
        </div>
        <div aria-hidden="true" className="pop-in absolute bottom-4 left-8 hidden w-[19rem] xl:block" style={delay(3)}>
          <div className="float-y">
            <AssistantBubble />
          </div>
        </div>
        <div aria-hidden="true" className="pop-in absolute right-8 top-32 hidden w-[17.5rem] xl:block" style={delay(4)}>
          <div className="float-y float-late">
            <LiveToast />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-right text-xs text-[#738099]">Aperçu de l’interface · valeurs d’illustration</figcaption>
    </figure>
  )
}

/* -------------------------------------------------------------------------- */
/* Mission SAMU                                                               */
/* -------------------------------------------------------------------------- */

const MISSION = [
  { label: 'Appel', state: 'done' },
  { label: 'Affectée', state: 'done' },
  { label: 'En route', state: 'current' },
  { label: 'Sur place', state: 'next' },
  { label: 'Hôpital', state: 'next' },
] as const

/** Suivi d'une mission, tel que le montre la régulation. */
export const MissionCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    role="img"
    aria-label="Suivi d’une mission SAMU : ambulance affectée et en route ; destination proposée, un lit libre en réanimation."
    className={className}
  >
    <div aria-hidden="true" className="rounded-[1.25rem] bg-white p-4 text-[#071b43] shadow-[0_24px_50px_rgb(2_10_30/0.35)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[#64728a]">Mission SAMU</p>
          <p className="mt-1 text-sm font-extrabold">Ambulance affectée automatiquement</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#fde9ec] px-2.5 py-1 text-[0.6875rem] font-bold text-[#c8102e]">Priorité vitale</span>
      </div>
      <ol className="mt-5 grid grid-cols-5">
        {MISSION.map((step, k) => (
          <li key={step.label} className="relative flex flex-col items-center gap-2 text-center">
            {k > 0 && (
              <span className={`absolute right-1/2 top-[7px] h-0.5 w-full ${step.state === 'next' ? 'bg-[#e3e8f1]' : 'bg-[#0f2547]'}`} />
            )}
            {step.state === 'done' && (
              <span className="relative grid h-4 w-4 place-items-center rounded-full bg-[#0f2547] text-white">
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </span>
            )}
            {step.state === 'current' && (
              <span className="relative h-4 w-4 rounded-full bg-[#f20b2b] ring-4 ring-[#f20b2b]/20">
                <span className="absolute inset-0 rounded-full bg-[#f20b2b]/60 motion-safe:animate-ping" />
              </span>
            )}
            {step.state === 'next' && <span className="relative h-4 w-4 rounded-full border-2 border-[#d5dce8] bg-white" />}
            <span
              className={`text-[0.6875rem] ${
                step.state === 'current' ? 'font-bold text-[#071b43]' : step.state === 'done' ? 'text-[#3d4a63]' : 'text-[#94a0b4]'
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-4 flex items-start gap-2 border-t border-[#edf0f5] pt-3.5 text-[0.8125rem] leading-snug text-[#3d4a63]">
        <BedDouble className="mt-px h-4 w-4 shrink-0 text-[#0868cf]" />
        <span>
          Destination proposée : <b className="font-bold text-[#071b43]">lit libre en réanimation</b>
        </span>
      </p>
    </div>
  </div>
)

/* -------------------------------------------------------------------------- */
/* Application donneurs                                                       */
/* -------------------------------------------------------------------------- */

/** L'alerte plein écran de l'application mobile, telle que la reçoit un donneur. */
export const DonorAlertPhone: React.FC = () => (
  <div
    role="img"
    aria-label="Alerte de l’application donneurs : urgence vitale, groupe O− requis dans un hôpital à 2,4 km, avec un bouton « J’y vais maintenant »."
    className="relative z-10"
  >
    <div
      aria-hidden="true"
      className="w-[17.5rem] rounded-[2.9rem] bg-[#0c1322] p-[9px] shadow-[0_40px_80px_rgb(3_22_50/0.35),inset_0_0_0_1px_rgb(255_255_255/0.08)]"
    >
      <div className="relative h-[34.5rem] overflow-hidden rounded-[2.35rem] bg-[#f4f5f7] text-[#0d1117]">
        <span className="absolute left-1/2 top-2.5 z-30 h-[1.6rem] w-[5.5rem] -translate-x-1/2 rounded-full bg-[#0c1322]" />
        <div className="relative z-20 flex items-center justify-between px-7 pt-3.5 text-[0.75rem] font-semibold">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="h-3.5 w-3.5" />
            <Wifi className="h-3.5 w-3.5" />
            <BatteryFull className="h-4 w-4" />
          </span>
        </div>

        {/* Écran des alertes, sous la modale */}
        <div className="px-5 pt-7">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-[#8b949e]">Jappo Dundu</p>
          <p className="text-[1.375rem] font-bold tracking-[-0.02em]">Alertes</p>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="mt-3 flex h-[4.5rem] items-center gap-3 rounded-2xl border border-[#e1e4e8] bg-white px-3">
              <span className="h-10 w-10 rounded-full bg-[#f0f1f4]" />
              <span className="flex-1 space-y-1.5">
                <span className="block h-2 w-3/4 rounded-full bg-[#e6e8ec]" />
                <span className="block h-2 w-1/2 rounded-full bg-[#eef0f3]" />
              </span>
            </div>
          ))}
        </div>

        <div className="absolute inset-0 z-10 bg-[#0d1117]/55" />
        <div className="absolute inset-x-3 top-[45%] z-20 -translate-y-1/2 overflow-hidden rounded-[1.6rem] bg-white shadow-[0_20px_40px_rgb(0_0_0/0.3)]">
          <div className="flex items-center justify-center gap-2 bg-[#e4151e] py-3 text-white">
            <HeartPulse className="heartbeat h-4 w-4" />
            <span className="text-[0.75rem] font-extrabold tracking-[0.14em]">URGENCE VITALE</span>
          </div>
          <div className="px-4 pb-4 pt-4 text-center">
            <p className="text-[1.0625rem] font-bold leading-snug">Hôpital de district</p>
            <p className="mt-1 flex items-center justify-center gap-1 text-[0.75rem] text-[#57606a]">
              <MapPin className="h-3.5 w-3.5" /> Pikine • 2,4 km
            </p>
            <div className="mt-4 flex items-center rounded-2xl border border-[#e4151e]/25 bg-[#e4151e]/10 px-3.5 py-2.5">
              <div className="flex-1 text-left">
                <p className="text-[0.5625rem] font-semibold uppercase tracking-[0.14em] text-[#57606a]">Groupe requis</p>
                <p className="text-[0.75rem] font-bold text-[#e4151e]">Besoin immédiat</p>
              </div>
              <span className="mx-3 h-8 w-px bg-[#e4151e]/25" />
              <span className="text-[1.75rem] font-extrabold leading-none text-[#e4151e]">O−</span>
            </div>
            <div className="mt-4 flex h-11 items-center justify-center gap-2 rounded-full bg-[#e4151e] text-[0.75rem] font-extrabold tracking-[0.06em] text-white">
              J’Y VAIS MAINTENANT <ArrowRight className="h-4 w-4" />
            </div>
            <p className="mt-3 text-[0.75rem] font-semibold text-[#57606a]">Plus tard</p>
          </div>
        </div>
      </div>
    </div>
  </div>
)
