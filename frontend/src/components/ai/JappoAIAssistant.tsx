import React, { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Ambulance as AmbulanceIcon,
  ArrowRight,
  BedDouble,
  BrainCircuit,
  CheckCircle2,
  Droplets,
  RotateCcw,
  Send,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { canManage, canView, primaryRoleLabel } from '@/lib/access'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { formatNumber, formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/Badge'
import type {
  Ambulance,
  BedCapacity,
  BedSummaryRow,
  BloodRequest,
  Mission,
  Prediction,
  PredictionSummaryRow,
} from '@/types/api'

interface JappoAIAssistantProps {
  isOpen: boolean
  onClose: () => void
}

interface AssistantMetric {
  label: string
  value: string
  tone?: 'danger' | 'warning' | 'success' | 'info'
}

interface AssistantTableRow {
  col1: string
  col2: string
  col3: string
  badge?: { text: string; tone: 'danger' | 'warning' | 'success' | 'info' | 'neutral' }
}

interface AssistantResponseBlock {
  summary: string
  metrics?: AssistantMetric[]
  tableHeaders?: [string, string, string]
  tableRows?: AssistantTableRow[]
  recommendations?: string[]
  actionLink?: { to: string; label: string }
}

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  prompt?: string
  response?: AssistantResponseBlock
  timestamp: string
}

interface QuickPrompt {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  accentClass: string
  query: string
}

let hasPlayedInitialIntro = false

const timeFmt = new Intl.DateTimeFormat('fr-SN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dakar',
})

/**
 * Assistant IA de régulation Jappo Dundu.
 * Séquence d'ouverture chorégraphiée au premier accès, puis transition rapide
 * lors des réouvertures. Analyse exclusivement les données réelles du réseau.
 */
export const JappoAIAssistant: React.FC<JappoAIAssistantProps> = ({ isOpen, onClose }) => {
  const { user, roles } = useAuth()
  const queryClient = useQueryClient()
  const [introReady, setIntroReady] = useState(() => hasPlayedInitialIntro)
  const [isThinking, setIsThinking] = useState(false)
  const [thinkingLabel, setThinkingLabel] = useState('Interrogation des flux temps réel…')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const msgSeqRef = useRef(0)

  const seeBlood = canView(roles, 'blood')
  const seeBeds = canView(roles, 'beds')
  const seeFleet = canManage(roles, 'ambulances')
  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || user?.username || 'Régulateur'

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const introStage: 'emblem' | 'ready' = hasPlayedInitialIntro || reducedMotion || introReady ? 'ready' : 'emblem'

  // Séquence d'ouverture : 520ms au premier accès (sauf si prefers-reduced-motion),
  // puis ouverture directe lors des retours suivants.
  useEffect(() => {
    if (!isOpen) return

    if (!hasPlayedInitialIntro && !reducedMotion) {
      const timer = setTimeout(() => {
        hasPlayedInitialIntro = true
        setIntroReady(true)
        inputRef.current?.focus()
      }, 520)
      return () => clearTimeout(timer)
    } else {
      hasPlayedInitialIntro = true
      const timer = setTimeout(() => {
        setIntroReady(true)
        inputRef.current?.focus()
      }, 60)
      return () => clearTimeout(timer)
    }
  }, [isOpen, reducedMotion])

  // Fermeture sur Échap
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Défilement automatique vers le dernier message
  useEffect(() => {
    if (scrollRef.current && typeof scrollRef.current.scrollTo === 'function') {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, isThinking])

  if (!isOpen) return null

  const quickPrompts: QuickPrompt[] = [
    {
      id: 'global',
      title: 'Synthèse des urgences prioritaires',
      subtitle: 'Point de situation immédiat sur votre périmètre',
      icon: <Sparkles className="h-4 w-4" />,
      accentClass: 'bg-brand/10 text-brand',
      query: 'Quelles sont les urgences prioritaires et tensions actuelles ?',
    },
    ...(seeBeds
      ? [
          {
            id: 'beds',
            title: 'Lits & services hospitaliers en tension',
            subtitle: 'Taux d’occupation, réanimation et lits libres',
            icon: <BedDouble className="h-4 w-4" />,
            accentClass: 'bg-accent-blue/12 text-accent-blue',
            query: 'Quel est l’état des lits disponibles et des services en tension ?',
          },
        ]
      : []),
    ...(seeBlood
      ? [
          {
            id: 'blood',
            title: 'Demandes de sang & risques CQR à 7 j',
            subtitle: 'Urgences vitales et groupes sanguins critiques',
            icon: <Droplets className="h-4 w-4" />,
            accentClass: 'bg-accent-red/12 text-accent-red',
            query: 'Analyse les demandes de sang ouvertes et les pénuries prévues à 7 jours.',
          },
        ]
      : []),
    ...(seeFleet
      ? [
          {
            id: 'fleet',
            title: 'Flotte SAMU & missions en attente',
            subtitle: 'Véhicules disponibles et interventions actives',
            icon: <AmbulanceIcon className="h-4 w-4" />,
            accentClass: 'bg-accent-green/12 text-accent-green',
            query: 'Quel est l’état de la flotte d’ambulances et des missions SAMU ?',
          },
        ]
      : []),
  ]

  /** Collecte les données réelles depuis le cache React Query ou l'API. */
  const gatherLiveContext = async () => {
    let bedSummary = queryClient.getQueryData<BedSummaryRow[]>(QK.bedsSummary)
    const facilityCapacities = user?.facility
      ? queryClient.getQueryData<BedCapacity[]>([...QK.bedCapacities, 'facility', user.facility.id])
      : undefined
    let bloodRequests = queryClient.getQueryData<BloodRequest[]>([...QK.bloodRequests, 'open'])
    let predictionSummary = queryClient.getQueryData<PredictionSummaryRow[]>(QK.predictionsSummary)
    const regionPredictions = user?.facility
      ? queryClient.getQueryData<Prediction[]>([...QK.mlPredictionsList, 'outlook', user.facility.region])
      : undefined
    let ambulances = queryClient.getQueryData<Ambulance[]>(QK.ambulancesList)
    let activeMissions = queryClient.getQueryData<Mission[]>(QK.missionsActive)

    try {
      if (seeBeds && !bedSummary && !facilityCapacities) {
        bedSummary = (await api.get<BedSummaryRow[]>('/api/lits/capacities/summary/')) ?? []
      }
      if (seeBlood && !bloodRequests) {
        const res = await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', { status: 'open' })
        bloodRequests = res?.results ?? []
      }
      if (seeBlood && !predictionSummary && !regionPredictions) {
        predictionSummary = (await api.get<PredictionSummaryRow[]>('/api/ml/predictions/summary/')) ?? []
      }
      if (seeFleet && !ambulances) {
        const res = await api.get<{ results: Ambulance[] }>('/api/ambulances/vehicles/')
        ambulances = res?.results ?? []
      }
      if (seeFleet && !activeMissions) {
        const res = await api.get<{ results: Mission[] }>('/api/ambulances/missions/', { active: true })
        activeMissions = res?.results ?? []
      }
    } catch {
      // En cas d'erreur réseau ou test isolé, on exploite les données déjà en cache.
    }

    return {
      bedSummary: bedSummary ?? [],
      facilityCapacities: facilityCapacities ?? [],
      bloodRequests: bloodRequests ?? [],
      predictionSummary: predictionSummary ?? [],
      regionPredictions: regionPredictions ?? [],
      ambulances: ambulances ?? [],
      activeMissions: activeMissions ?? [],
    }
  }

  /** Construit une réponse analytique structurée à partir des vraies données. */
  const buildAnalyticalResponse = async (rawQuery: string): Promise<AssistantResponseBlock> => {
    const q = rawQuery.toLowerCase()
    const ctx = await gatherLiveContext()

    // Calculs Lits
    const bedRows =
      ctx.facilityCapacities.length > 0
        ? ctx.facilityCapacities.map((c) => ({
            label: c.category_display,
            total: c.total_beds,
            occupied: c.occupied_beds,
            available: c.available_beds,
            rate: c.total_beds > 0 ? c.occupied_beds / c.total_beds : 0,
          }))
        : ctx.bedSummary.map((r) => ({
            label: `${r.category_display}${r.region_display ? ` (${r.region_display})` : ''}`,
            total: r.total_beds,
            occupied: r.occupied_beds,
            available: r.available_beds,
            rate: r.total_beds > 0 ? r.occupied_beds / r.total_beds : 0,
          }))

    const totalBeds = bedRows.reduce((s, r) => s + r.total, 0)
    const availBeds = bedRows.reduce((s, r) => s + r.available, 0)
    const globalBedRate = totalBeds > 0 ? (totalBeds - availBeds) / totalBeds : 0
    const tenseBeds = [...bedRows].filter((r) => r.rate >= 0.85 || r.available === 0).sort((a, b) => b.rate - a.rate)

    // Calculs Sang & ML
    const openReqs = ctx.bloodRequests
    const criticalReqs = openReqs.filter((r) => r.urgency === 'critical')
    const missingUnits = openReqs.reduce((s, r) => s + r.units_remaining, 0)
    const critPredCount =
      ctx.predictionSummary.length > 0
        ? ctx.predictionSummary.reduce((s, p) => s + p.critical_count, 0)
        : ctx.regionPredictions.filter((p) => p.risk_level === 'CRITICAL').length

    // Calculs Flotte
    const totalAmb = ctx.ambulances.length
    const availAmb = ctx.ambulances.filter((a) => a.status === 'available').length
    const pendingMissions = ctx.activeMissions.filter((m) => m.status === 'pending')

    // 1. Question orientée LITS
    if (q.includes('lit') || q.includes('réa') || q.includes('service') || q.includes('occupation')) {
      return {
        summary:
          totalBeds === 0
            ? 'Aucune capacité hospitalière n’est actuellement remontée dans votre périmètre.'
            : `${formatNumber(availBeds)} lits libres sur ${formatNumber(totalBeds)} (${formatPercent(globalBedRate)} d’occupation). ${
                tenseBeds.length > 0
                  ? `${tenseBeds.length} service(s) dépassent le seuil de vigilance de 85 %.`
                  : 'Aucun service ne dépasse le seuil critique de 85 %.'
              }`,
        metrics: [
          {
            label: 'Lits libres',
            value: `${formatNumber(availBeds)} / ${formatNumber(totalBeds)}`,
            tone: availBeds === 0 ? 'danger' : 'info',
          },
          {
            label: 'Taux d’occupation',
            value: formatPercent(globalBedRate),
            tone: globalBedRate > 0.85 ? 'danger' : globalBedRate > 0.7 ? 'warning' : 'success',
          },
          {
            label: 'Services en tension',
            value: `${tenseBeds.length}`,
            tone: tenseBeds.length > 0 ? 'danger' : 'success',
          },
        ],
        tableHeaders: ['Service', 'Disponibilité', 'Occupation'],
        tableRows: [...bedRows]
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 5)
          .map((r) => ({
            col1: r.label,
            col2: `${r.available} libre(s) / ${r.total}`,
            col3: formatPercent(r.rate),
            badge: {
              text: r.available === 0 ? 'Saturé' : r.rate >= 0.85 ? 'Tension' : 'Nominal',
              tone: r.available === 0 ? 'danger' : r.rate >= 0.85 ? 'warning' : 'success',
            },
          })),
        recommendations:
          tenseBeds.length > 0
            ? [
                `Prioriser le délestage ou le transfert inter-hospitalier pour : ${tenseBeds
                  .slice(0, 2)
                  .map((t) => t.label)
                  .join(', ')}.`,
                'Vérifier les sorties prévues dans les prochaines heures pour libérer des places.',
              ]
            : ['Capacité hospitalière équilibrée : maintenir la confirmation régulière des lits.'],
        actionLink: { to: '/beds', label: 'Ouvrir la gestion des lits' },
      }
    }

    // 2. Question orientée SANG / PÉNURIES ML
    if (q.includes('sang') || q.includes('pénurie') || q.includes('poche') || q.includes('donneur') || q.includes('groupe')) {
      return {
        summary: `${openReqs.length} demande(s) de sang ouverte(s) (${formatNumber(missingUnits)} poches requises), dont ${criticalReqs.length} en urgence vitale. Le modèle quantile CQR signale ${critPredCount} risque(s) critique(s) de pénurie à 7 jours.`,
        metrics: [
          {
            label: 'Demandes ouvertes',
            value: `${openReqs.length}`,
            tone: criticalReqs.length > 0 ? 'danger' : 'info',
          },
          {
            label: 'Urgences vitales',
            value: `${criticalReqs.length}`,
            tone: criticalReqs.length > 0 ? 'danger' : 'success',
          },
          {
            label: 'Risques CQR (7 j)',
            value: `${critPredCount} critique(s)`,
            tone: critPredCount > 0 ? 'danger' : 'success',
          },
        ],
        tableHeaders: ['Groupe', 'Établissement', 'Besoin restant'],
        tableRows: openReqs.slice(0, 5).map((r) => ({
          col1: r.blood_group,
          col2: r.facility?.name || 'Établissement',
          col3: `${r.units_remaining} poche(s)`,
          badge: {
            text: r.urgency_display,
            tone: r.urgency === 'critical' ? 'danger' : r.urgency === 'urgent' ? 'warning' : 'info',
          },
        })),
        recommendations: [
          criticalReqs.length > 0
            ? `Mobiliser immédiatement les donneurs compatibles pour ${criticalReqs.map((r) => r.blood_group).join(', ')}.`
            : 'Aucune demande en urgence vitale immédiate.',
          critPredCount > 0
            ? 'Consulter le module Prévisions de pénurie pour anticiper les commandes auprès du CNTS.'
            : 'Les stocks prévisionnels à 7 jours sont dans les bornes de sécurité.',
        ],
        actionLink: { to: '/blood', label: 'Accéder à la Banque de sang' },
      }
    }

    // 3. Question orientée AMBULANCES / SAMU
    if (q.includes('ambulance') || q.includes('samu') || q.includes('mission') || q.includes('flotte')) {
      return {
        summary: `${availAmb} ambulance(s) disponible(s) sur ${totalAmb} dans la flotte. ${ctx.activeMissions.length} mission(s) active(s) en cours, dont ${pendingMissions.length} en attente d’affectation.`,
        metrics: [
          {
            label: 'Flotte disponible',
            value: `${availAmb} / ${totalAmb}`,
            tone: availAmb <= 1 ? 'warning' : 'success',
          },
          {
            label: 'Missions actives',
            value: `${ctx.activeMissions.length}`,
            tone: 'info',
          },
          {
            label: 'En attente d’affectation',
            value: `${pendingMissions.length}`,
            tone: pendingMissions.length > 0 ? 'danger' : 'success',
          },
        ],
        tableHeaders: ['Mission', 'Lieu de prise en charge', 'Statut'],
        tableRows: ctx.activeMissions.slice(0, 5).map((m) => ({
          col1: m.description || `Mission #${m.id}`,
          col2: m.pickup_address || '—',
          col3: m.ambulance ? m.ambulance.plate_number : 'Non affectée',
          badge: {
            text: m.priority_display,
            tone: m.priority === 'critical' ? 'danger' : m.priority === 'urgent' ? 'warning' : 'info',
          },
        })),
        recommendations:
          pendingMissions.length > 0
            ? [`Affecter en priorité les ${pendingMissions.length} mission(s) en attente via le dispatcheur PostGIS.`]
            : ['Toutes les missions actives disposent d’un équipage affecté.'],
        actionLink: { to: '/ambulances', label: 'Ouvrir la régulation SAMU' },
      }
    }

    // 4. Synthèse globale multi-domaines
    const priorities: string[] = []
    if (seeBeds && tenseBeds.length > 0) {
      priorities.push(`${tenseBeds.length} service(s) hospitalier(s) en tension (> 85 % d’occupation).`)
    }
    if (seeBlood && criticalReqs.length > 0) {
      priorities.push(`${criticalReqs.length} demande(s) de sang en urgence vitale immédiate.`)
    }
    if (seeBlood && critPredCount > 0) {
      priorities.push(`${critPredCount} alerte(s) prédictive(s) de pénurie sanguine à 7 jours.`)
    }
    if (seeFleet && pendingMissions.length > 0) {
      priorities.push(`${pendingMissions.length} mission(s) SAMU en attente d’une ambulance.`)
    }

    return {
      summary:
        priorities.length > 0
          ? `Synthèse temps réel : ${priorities.length} point(s) d’attention prioritaires identifiés sur votre périmètre.`
          : 'Synthèse temps réel : l’ensemble des indicateurs de votre périmètre est actuellement à un niveau nominal.',
      metrics: [
        ...(seeBeds
          ? [
              {
                label: 'Lits libres',
                value: `${formatNumber(availBeds)} / ${formatNumber(totalBeds)}`,
                tone: (globalBedRate > 0.85 ? 'danger' : 'info') as AssistantMetric['tone'],
              },
            ]
          : []),
        ...(seeBlood
          ? [
              {
                label: 'Demandes de sang',
                value: `${openReqs.length} (${criticalReqs.length} vitale${criticalReqs.length > 1 ? 's' : ''})`,
                tone: (criticalReqs.length > 0 ? 'danger' : 'success') as AssistantMetric['tone'],
              },
            ]
          : []),
        ...(seeFleet
          ? [
              {
                label: 'Ambulances prêtes',
                value: `${availAmb} / ${totalAmb}`,
                tone: (availAmb <= 1 ? 'warning' : 'success') as AssistantMetric['tone'],
              },
            ]
          : []),
      ],
      recommendations:
        priorities.length > 0
          ? priorities
          : ['Aucune alerte critique en cours. Les flux temps réel sont synchronisés.'],
    }
  }

  const submitQuery = async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed || isThinking) return

    msgSeqRef.current += 1
    const userMsg: ChatMessage = {
      id: `u-${msgSeqRef.current}`,
      sender: 'user',
      prompt: trimmed,
      timestamp: timeFmt.format(new Date()),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsThinking(true)
    setThinkingLabel('Analyse des indicateurs temps réel en cours…')

    const delay = reducedMotion ? 20 : 280
    const [responseBlock] = await Promise.all([
      buildAnalyticalResponse(trimmed),
      new Promise((resolve) => setTimeout(resolve, delay)),
    ])

    msgSeqRef.current += 1
    const aiMsg: ChatMessage = {
      id: `a-${msgSeqRef.current}`,
      sender: 'ai',
      response: responseBlock,
      timestamp: timeFmt.format(new Date()),
    }
    setIsThinking(false)
    setMessages((prev) => [...prev, aiMsg])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-[2px] transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-label="Jappo IA — Assistant de régulation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside className="ai-drawer-enter ai-mesh-surface relative flex h-full w-full max-w-[460px] flex-col border-l border-line-strong bg-surface shadow-[var(--shadow-hero)] sm:my-3 sm:mr-3 sm:h-[calc(100%-1.5rem)] sm:rounded-2xl sm:border">
        {/* En-tête de l'assistant */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-surface/90 px-5 py-3.5 backdrop-blur-md sm:rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#0f2547] text-white shadow-sm">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-fg">Jappo IA</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-ok/12 px-2 py-0.5 text-[10px] font-semibold text-ok">
                  <span className="live-pulse h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
                  En direct
                </span>
              </div>
              <p className="text-2xs text-muted">
                Assistant d’aide à la régulation · {primaryRoleLabel(roles)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg"
                title="Réinitialiser la conversation"
                aria-label="Réinitialiser la conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg"
              aria-label="Fermer l’assistant IA"
              title="Fermer (Échap)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Corps : Séquence d'ouverture & Conversation */}
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Médaillon central animé (inspiré de la vidéo de référence) */}
          <div
            className={`flex flex-col items-center text-center transition-all duration-500 ${
              introStage === 'emblem' ? 'py-16' : messages.length > 0 ? 'py-2' : 'py-5'
            }`}
          >
            <div className="ai-orb relative flex h-16 w-16 items-center justify-center rounded-full bg-surface ring-1 ring-line-strong">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-brand/20 via-accent-blue/20 to-transparent blur-md"
              />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#0f2547] via-[#1d4ed8] to-brand text-white shadow-md">
                <BrainCircuit className="h-6 w-6" aria-hidden="true" />
              </span>
            </div>

            {introStage === 'ready' && messages.length === 0 && (
              <div className="ai-stagger-item mt-4 max-w-sm space-y-1.5" style={{ '--ai-step': 0 } as React.CSSProperties}>
                <h3 className="text-base font-bold text-fg">Bonjour {firstName}, comment puis-je vous aider ?</h3>
                <p className="text-xs leading-relaxed text-muted">
                  J’analyse en temps réel les capacités hospitalières, les stocks sanguins, les prévisions quantiles CQR
                  et la flotte SAMU de votre périmètre.
                </p>
              </div>
            )}
          </div>

          {/* Suggestions d'actions rapides (affichées à l'accueil de l'assistant) */}
          {introStage === 'ready' && messages.length === 0 && (
            <div className="space-y-2" aria-label="Suggestions d’analyse">
              <p className="eyebrow px-1 text-2xs uppercase tracking-wider">Analyses rapides disponibles</p>
              {quickPrompts.map((item, idx) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => submitQuery(item.query)}
                  style={{ '--ai-step': idx + 1 } as React.CSSProperties}
                  className="ai-stagger-item card-interactive group flex w-full cursor-pointer items-center gap-3.5 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-line-strong"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.accentClass}`}>
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-fg group-hover:text-brand">
                      {item.title}
                    </span>
                    <span className="block truncate text-2xs text-muted">{item.subtitle}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg" />
                </button>
              ))}
            </div>
          )}

          {/* Historique des échanges */}
          {messages.map((msg) =>
            msg.sender === 'user' ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-gradient-to-br from-[#0f2547] to-[#1e3a8a] px-4 py-2.5 text-xs font-medium text-white shadow-sm">
                  <p>{msg.prompt}</p>
                  <span className="mt-1 block text-right text-[10px] text-white/65">{msg.timestamp}</span>
                </div>
              </div>
            ) : (
              <div key={msg.id} className="dash-rise space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                  <span className="inline-flex items-center gap-1.5 text-2xs font-semibold text-brand">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    Synthèse Jappo IA
                  </span>
                  <span className="num text-[10px] text-subtle">{msg.timestamp}</span>
                </div>

                {msg.response && (
                  <>
                    <p className="text-xs leading-relaxed text-fg">{msg.response.summary}</p>

                    {msg.response.metrics && msg.response.metrics.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {msg.response.metrics.map((m) => (
                          <div key={m.label} className="rounded-xl border border-line bg-raised/60 px-2.5 py-2">
                            <span className="block truncate text-[10px] text-muted">{m.label}</span>
                            <span
                              className={`num mt-0.5 block truncate text-xs font-bold ${
                                m.tone === 'danger'
                                  ? 'text-critical'
                                  : m.tone === 'warning'
                                    ? 'text-warning'
                                    : m.tone === 'success'
                                      ? 'text-ok'
                                      : 'text-fg'
                              }`}
                            >
                              {m.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {msg.response.tableRows && msg.response.tableRows.length > 0 && msg.response.tableHeaders && (
                      <div className="overflow-hidden rounded-xl border border-line">
                        <table className="w-full text-left text-2xs">
                          <thead className="border-b border-line bg-raised/70 text-muted">
                            <tr>
                              <th className="px-2.5 py-1.5 font-medium">{msg.response.tableHeaders[0]}</th>
                              <th className="px-2.5 py-1.5 font-medium">{msg.response.tableHeaders[1]}</th>
                              <th className="px-2.5 py-1.5 text-right font-medium">{msg.response.tableHeaders[2]}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line bg-surface">
                            {msg.response.tableRows.map((row, rIdx) => (
                              <tr key={`${row.col1}-${rIdx}`}>
                                <td className="px-2.5 py-1.5 font-medium text-fg">{row.col1}</td>
                                <td className="px-2.5 py-1.5 text-muted">{row.col2}</td>
                                <td className="px-2.5 py-1.5 text-right">
                                  {row.badge ? (
                                    <Badge size="sm" tone={row.badge.tone}>
                                      {row.badge.text}
                                    </Badge>
                                  ) : (
                                    <span className="num font-medium text-fg">{row.col3}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {msg.response.recommendations && msg.response.recommendations.length > 0 && (
                      <ul className="space-y-1.5 rounded-xl bg-raised/50 p-3 text-2xs text-fg">
                        {msg.response.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2">
                            {rec.includes('tension') || rec.includes('vitale') || rec.includes('attente') ? (
                              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
                            ) : (
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
                            )}
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {msg.response.actionLink && (
                      <div className="pt-1">
                        <Link
                          to={msg.response.actionLink.to}
                          onClick={onClose}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
                        >
                          {msg.response.actionLink.label}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          )}

          {/* État animé pendant que l'IA réfléchit */}
          {isThinking && (
            <div
              role="status"
              aria-live="polite"
              className="dash-rise space-y-2.5 rounded-2xl border border-line bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                <Sparkles className="live-pulse h-4 w-4 text-brand" aria-hidden="true" />
                <span>{thinkingLabel}</span>
              </div>
              <div className="ai-thinking-bar h-2 w-full rounded-full" />
              <div className="ai-thinking-bar h-2 w-2/3 rounded-full" />
            </div>
          )}

          {/* Suggestions rapides en bas de conversation */}
          {messages.length > 0 && !isThinking && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickPrompts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => submitQuery(item.query)}
                  className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1 text-2xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Barre de saisie en pied de tiroir */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitQuery(input)
          }}
          className="shrink-0 border-t border-line bg-surface/95 p-3.5 backdrop-blur-md sm:rounded-b-2xl"
        >
          <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-canvas px-3 py-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question sur les lits, le sang ou le SAMU…"
              aria-label="Question pour l’assistant IA"
              className="w-full bg-transparent text-xs text-fg placeholder:text-subtle focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              aria-label="Envoyer la question"
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0f2547] text-white transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-brand"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
