import React, { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  Ambulance as AmbulanceIcon,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  CornerDownLeft,
  Droplets,
  Plus,
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
  tag: string
  icon: React.ReactNode
  badgeBg: string
  query: string
}

let hasPlayedInitialIntro = false

const GENERIC_NAMES = new Set([
  'responsable',
  'admin',
  'administrateur',
  'gestionnaire',
  'regulateur',
  'régulateur',
  'user',
  'utilisateur',
])

const timeFmt = new Intl.DateTimeFormat('fr-SN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Africa/Dakar',
})

/**
 * Assistant IA de régulation Jappo Dundu — Design Haute Couture (style FlowAI / Copilot).
 * Médaillon orbital prismatique 3D, télémétrie en direct, cartes d'analyse
 * interactives avec badges contextuels et éditeur de commande à deux niveaux.
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

  const rawFirst = (user?.first_name || user?.full_name?.split(' ')[0] || '').trim()
  const hasPersonalName = rawFirst.length > 1 && !GENERIC_NAMES.has(rawFirst.toLowerCase())

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const introStage: 'emblem' | 'ready' = hasPlayedInitialIntro || reducedMotion || introReady ? 'ready' : 'emblem'

  useEffect(() => {
    if (!isOpen) return

    if (!hasPlayedInitialIntro && !reducedMotion) {
      const timer = setTimeout(() => {
        hasPlayedInitialIntro = true
        setIntroReady(true)
        inputRef.current?.focus()
      }, 480)
      return () => clearTimeout(timer)
    } else {
      hasPlayedInitialIntro = true
      const timer = setTimeout(() => {
        setIntroReady(true)
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen, reducedMotion])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

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
      tag: 'Priorité',
      icon: <Sparkles className="h-3.5 w-3.5" />,
      badgeBg: 'bg-[#e11d48]/12 text-[#e11d48] ring-1 ring-[#e11d48]/20 dark:bg-[#fb7185]/15 dark:text-[#fb7185]',
      query: 'Quelles sont les urgences prioritaires et tensions actuelles ?',
    },
    ...(seeBeds
      ? [
          {
            id: 'beds',
            title: 'Lits & services hospitaliers en tension',
            tag: 'Temps réel',
            icon: <BedDouble className="h-3.5 w-3.5" />,
            badgeBg: 'bg-[#2563eb]/12 text-[#2563eb] ring-1 ring-[#2563eb]/20 dark:bg-[#60a5fa]/15 dark:text-[#60a5fa]',
            query: 'Quel est l’état des lits disponibles et des services en tension ?',
          },
        ]
      : []),
    ...(seeBlood
      ? [
          {
            id: 'blood',
            title: 'Demandes de sang & risques CQR à 7 j',
            tag: 'CQR 7 j',
            icon: <Droplets className="h-3.5 w-3.5" />,
            badgeBg: 'bg-[#d97706]/12 text-[#d97706] ring-1 ring-[#d97706]/20 dark:bg-[#fbbf24]/15 dark:text-[#fbbf24]',
            query: 'Analyse les demandes de sang ouvertes et les pénuries prévues à 7 jours.',
          },
        ]
      : []),
    ...(seeFleet
      ? [
          {
            id: 'fleet',
            title: 'Flotte SAMU & missions en attente',
            tag: 'PostGIS',
            icon: <AmbulanceIcon className="h-3.5 w-3.5" />,
            badgeBg: 'bg-[#059669]/12 text-[#059669] ring-1 ring-[#059669]/20 dark:bg-[#34d399]/15 dark:text-[#34d399]',
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

    const openReqs = ctx.bloodRequests
    const criticalReqs = openReqs.filter((r) => r.urgency === 'critical')
    const missingUnits = openReqs.reduce((s, r) => s + r.units_remaining, 0)
    const critPredCount =
      ctx.predictionSummary.length > 0
        ? ctx.predictionSummary.reduce((s, p) => s + p.critical_count, 0)
        : ctx.regionPredictions.filter((p) => p.risk_level === 'CRITICAL').length

    const totalAmb = ctx.ambulances.length
    const availAmb = ctx.ambulances.filter((a) => a.status === 'available').length
    const pendingMissions = ctx.activeMissions.filter((m) => m.status === 'pending')

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
            label: 'Occupation',
            value: formatPercent(globalBedRate),
            tone: globalBedRate > 0.85 ? 'danger' : globalBedRate > 0.7 ? 'warning' : 'success',
          },
          {
            label: 'En tension',
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

    if (q.includes('sang') || q.includes('pénurie') || q.includes('poche') || q.includes('donneur') || q.includes('groupe')) {
      return {
        summary: `${openReqs.length} demande(s) de sang ouverte(s) (${formatNumber(missingUnits)} poches requises), dont ${criticalReqs.length} en urgence vitale. Le modèle quantile CQR signale ${critPredCount} risque(s) critique(s) de pénurie à 7 jours.`,
        metrics: [
          {
            label: 'Demandes',
            value: `${openReqs.length}`,
            tone: criticalReqs.length > 0 ? 'danger' : 'info',
          },
          {
            label: 'Vitales',
            value: `${criticalReqs.length}`,
            tone: criticalReqs.length > 0 ? 'danger' : 'success',
          },
          {
            label: 'Risques CQR',
            value: `${critPredCount} crit.`,
            tone: critPredCount > 0 ? 'danger' : 'success',
          },
        ],
        tableHeaders: ['Groupe', 'Établissement', 'Besoin'],
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

    if (q.includes('ambulance') || q.includes('samu') || q.includes('mission') || q.includes('flotte')) {
      return {
        summary: `${availAmb} ambulance(s) disponible(s) sur ${totalAmb} dans la flotte. ${ctx.activeMissions.length} mission(s) active(s) en cours, dont ${pendingMissions.length} en attente d’affectation.`,
        metrics: [
          {
            label: 'Flotte libre',
            value: `${availAmb} / ${totalAmb}`,
            tone: availAmb <= 1 ? 'warning' : 'success',
          },
          {
            label: 'Missions actives',
            value: `${ctx.activeMissions.length}`,
            tone: 'info',
          },
          {
            label: 'En attente',
            value: `${pendingMissions.length}`,
            tone: pendingMissions.length > 0 ? 'danger' : 'success',
          },
        ],
        tableHeaders: ['Mission', 'Prise en charge', 'Priorité'],
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
                label: 'Sang ouvert',
                value: `${openReqs.length} (${criticalReqs.length} vit.)`,
                tone: (criticalReqs.length > 0 ? 'danger' : 'success') as AssistantMetric['tone'],
              },
            ]
          : []),
        ...(seeFleet
          ? [
              {
                label: 'SAMU prêt',
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
    setThinkingLabel('Analyse des indicateurs temps réel…')

    const delay = reducedMotion ? 20 : 260
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
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/20 backdrop-blur-[1px] transition-opacity dark:bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-label="Jappo IA — Assistant de régulation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside className="ai-drawer-enter ai-panel-surface relative flex h-full w-full flex-col overflow-hidden sm:mt-14 sm:mr-4 sm:mb-4 sm:h-[calc(100%-4.5rem)] sm:max-w-[420px] sm:rounded-2xl">
        {/* Barre supérieure minimaliste Haute Couture */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line/80 bg-subtle/50 px-4 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-[#2563eb] to-[#1e3a8a] text-white shadow-xs">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold tracking-tight text-fg">
                Jappo IA <span className="font-normal text-muted">Copilot</span>
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-ok/25 bg-ok/10 px-2 py-0.5 text-[10px] font-medium text-ok">
                <span className="live-pulse h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
                Temps réel
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg"
                title="Nouvelle conversation"
                aria-label="Réinitialiser la conversation"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg"
              aria-label="Fermer l’assistant IA"
              title="Fermer (Échap)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Corps du panneau */}
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col justify-between overflow-y-auto px-4 py-4">
            {/* Scène supérieure : Système Orbital 3D + Médaillon Prismatique */}
            <div
              className={`ai-orb-stage relative flex flex-1 flex-col items-center justify-center transition-all duration-500 ${
                introStage === 'emblem' ? 'min-h-[240px]' : 'min-h-[168px]'
              }`}
            >
              <div className="relative flex h-28 w-28 items-center justify-center">
                {/* Anneau orbital externe */}
                <span
                  aria-hidden="true"
                  className="ai-orbit-slow pointer-events-none absolute inset-0 rounded-full border border-dashed border-line-strong/60"
                >
                  <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-[#2563eb] shadow-[0_0_8px_#2563eb]" />
                </span>

                {/* Anneau orbital intermédiaire */}
                <span
                  aria-hidden="true"
                  className="ai-orbit-reverse pointer-events-none absolute inset-3.5 rounded-full border border-[#2563eb]/20 dark:border-[#60a5fa]/25"
                >
                  <span className="absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-emerald-400" />
                </span>

                {/* Halo diffus */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-4 rounded-full bg-gradient-to-tr from-[#2563eb]/20 via-indigo-500/15 to-rose-500/15 blur-xl"
                />

                {/* Médaillon 3D central */}
                <div className="ai-orb ai-orb-medallion relative flex h-14 w-14 items-center justify-center rounded-full">
                  <Sparkles className="h-6 w-6 text-[#2563eb] dark:text-[#60a5fa]" aria-hidden="true" />
                </div>
              </div>

              {introStage === 'ready' && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-surface/80 px-2.5 py-0.5 text-[10px] font-medium text-muted shadow-2xs backdrop-blur-xs">
                  <Activity className="h-3 w-3 text-[#2563eb] dark:text-[#60a5fa]" aria-hidden="true" />
                  <span>Flux connectés · PostGIS · Modèle CQR</span>
                </div>
              )}
            </div>

            {/* Section inférieure : Accueil éditorial aligné à gauche + Actions rapides */}
            {introStage === 'ready' && (
              <div className="space-y-3.5 pt-1">
                <div className="ai-stagger-item space-y-1 text-left" style={{ '--ai-step': 0 } as React.CSSProperties}>
                  <h3 className="text-base font-bold tracking-tight text-fg">
                    {hasPersonalName ? `Bonjour ${rawFirst} !` : 'Bonjour !'}
                  </h3>
                  <p className="text-xs leading-relaxed text-muted">
                    Posez vos questions sur les capacités hospitalières, les réserves de sang, les prévisions CQR ou la
                    flotte SAMU de votre périmètre.
                  </p>
                </div>

                <div className="space-y-1.5" aria-label="Suggestions d’analyse">
                  {quickPrompts.map((item, idx) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => submitQuery(item.query)}
                      style={{ '--ai-step': idx + 1 } as React.CSSProperties}
                      className="ai-stagger-item group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-line/80 bg-subtle/55 px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#2563eb]/40 hover:bg-surface hover:shadow-sm"
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 ${item.badgeBg}`}
                      >
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg group-hover:text-[#2563eb] dark:group-hover:text-[#60a5fa]">
                        {item.title}
                      </span>
                      <span className="rounded-md border border-line/70 bg-surface/80 px-1.5 py-0.5 text-[10px] font-medium text-muted transition-colors group-hover:border-[#2563eb]/30 group-hover:text-[#2563eb] dark:group-hover:text-[#60a5fa]">
                        {item.tag}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#2563eb] dark:group-hover:text-[#60a5fa]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Fil de conversation actif */
          <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
            {messages.map((msg) =>
              msg.sender === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-xs bg-gradient-to-br from-[#1e3a8a] to-[#0f2547] px-3.5 py-2.5 text-xs font-medium text-white shadow-xs">
                    <p>{msg.prompt}</p>
                  </div>
                </div>
              ) : (
                <div
                  key={msg.id}
                  className="dash-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-xs"
                >
                  <div className="h-1 w-full bg-gradient-to-r from-[#2563eb] via-[#6366f1] to-[#10b981]" />
                  <div className="space-y-3 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-fg">
                        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[#2563eb]/15 text-[#2563eb] dark:text-[#60a5fa]">
                          <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                        </span>
                        Synthèse Jappo IA
                      </span>
                      <span className="num text-[10px] text-subtle">{msg.timestamp}</span>
                    </div>

                    {msg.response && (
                      <>
                        <p className="text-xs leading-relaxed text-fg">{msg.response.summary}</p>

                        {msg.response.metrics && msg.response.metrics.length > 0 && (
                          <div className="grid grid-cols-3 gap-1.5">
                            {msg.response.metrics.map((m) => (
                              <div
                                key={m.label}
                                className={`rounded-xl border border-line/70 bg-subtle/50 px-2.5 py-2 border-l-2 ${
                                  m.tone === 'danger'
                                    ? 'border-l-critical'
                                    : m.tone === 'warning'
                                      ? 'border-l-warning'
                                      : m.tone === 'success'
                                        ? 'border-l-ok'
                                        : 'border-l-[#2563eb]'
                                }`}
                              >
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
                          <div className="overflow-hidden rounded-xl border border-line/80 bg-subtle/30">
                            <table className="w-full text-left text-[11px]">
                              <thead className="border-b border-line/80 bg-subtle/70 text-muted">
                                <tr>
                                  <th className="px-2.5 py-1.5 font-medium">{msg.response.tableHeaders[0]}</th>
                                  <th className="px-2.5 py-1.5 font-medium">{msg.response.tableHeaders[1]}</th>
                                  <th className="px-2.5 py-1.5 text-right font-medium">
                                    {msg.response.tableHeaders[2]}
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line/60 bg-surface">
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
                          <ul className="space-y-1.5 rounded-xl border border-line/60 bg-subtle/40 p-2.5 text-[11px] text-fg">
                            {msg.response.recommendations.map((rec, i) => (
                              <li key={i} className="flex items-start gap-2">
                                {rec.includes('tension') || rec.includes('vitale') || rec.includes('attente') ? (
                                  <TriangleAlert
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
                                )}
                                <span>{rec}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {msg.response.actionLink && (
                          <div className="pt-0.5">
                            <Link
                              to={msg.response.actionLink.to}
                              onClick={onClose}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb]/10 px-3 py-1.5 text-xs font-semibold text-[#2563eb] transition-colors hover:bg-[#2563eb]/20 dark:bg-[#60a5fa]/15 dark:text-[#60a5fa]"
                            >
                              {msg.response.actionLink.label}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            )}

            {isThinking && (
              <div
                role="status"
                aria-live="polite"
                className="dash-rise space-y-2 rounded-2xl border border-line/80 bg-surface p-3.5"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-fg">
                  <Sparkles className="live-pulse h-3.5 w-3.5 text-[#2563eb] dark:text-[#60a5fa]" aria-hidden="true" />
                  <span>{thinkingLabel}</span>
                </div>
                <div className="ai-thinking-bar h-1.5 w-full rounded-full" />
                <div className="ai-thinking-bar h-1.5 w-2/3 rounded-full" />
              </div>
            )}

            {!isThinking && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {quickPrompts.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => submitQuery(item.query)}
                    className="cursor-pointer rounded-lg border border-line/70 bg-subtle/50 px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-[#2563eb]/40 hover:bg-surface hover:text-fg"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Éditeur de commande à deux niveaux (style FlowAI / Linear) */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitQuery(input)
          }}
          className="shrink-0 p-3 pt-1"
        >
          <div className="rounded-xl border border-line bg-subtle/50 px-3.5 pt-3 pb-2.5 transition-all focus-within:border-[#2563eb]/50 focus-within:bg-surface focus-within:ring-3 focus-within:ring-[#2563eb]/12">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Interroger les lits, le sang, les prévisions CQR…"
              aria-label="Question pour l’assistant IA"
              className="w-full bg-transparent text-xs text-fg placeholder:text-muted focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (messages.length > 0) setMessages([])
                    inputRef.current?.focus()
                  }}
                  title="Afficher les analyses rapides"
                  aria-label="Afficher les suggestions rapides"
                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-line/80 bg-surface text-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <span className="truncate rounded-md bg-surface/80 px-2 py-0.5 text-[10px] font-medium text-muted">
                  {primaryRoleLabel(roles)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden items-center gap-0.5 rounded-md border border-line/70 bg-surface/70 px-1.5 py-0.5 text-[10px] text-subtle sm:inline-flex">
                  <CornerDownLeft className="h-2.5 w-2.5" aria-hidden="true" /> Entrée
                </span>
                <button
                  type="submit"
                  disabled={!input.trim() || isThinking}
                  aria-label="Envoyer la question"
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#1d4ed8] text-white shadow-xs transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </form>
      </aside>
    </div>
  )
}
