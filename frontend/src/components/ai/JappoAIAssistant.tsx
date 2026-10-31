import React, { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, ArrowUp, SquarePen, X } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { canManage, canView } from '@/lib/access'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { formatNumber, formatPercent } from '@/lib/format'
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

interface AssistantTableRow {
  col1: string
  col2: string
  col3: string
}

interface AssistantResponseBlock {
  summary: string
  tableHeaders?: [string, string, string]
  tableRows?: AssistantTableRow[]
  bullets?: string[]
  actionLink?: { to: string; label: string }
}

interface ChatMessage {
  id: string
  sender: 'user' | 'ai'
  prompt?: string
  response?: AssistantResponseBlock
}

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

/**
 * Assistant sobre et épuré (style ChatGPT / Claude).
 * Aucune fioriture visuelle superflue : typographie claire, puces de suggestions
 * minimalistes, réponses rédigées naturellement et champ de saisie simple.
 */
export const JappoAIAssistant: React.FC<JappoAIAssistantProps> = ({ isOpen, onClose }) => {
  const { user, roles } = useAuth()
  const queryClient = useQueryClient()
  const [isThinking, setIsThinking] = useState(false)
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

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(timer)
  }, [isOpen])

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

  const quickPrompts = [
    {
      id: 'global',
      title: 'Point de situation général',
      query: 'Quelles sont les urgences prioritaires et tensions actuelles ?',
    },
    ...(seeBeds
      ? [
          {
            id: 'beds',
            title: 'Lits & services hospitaliers en tension',
            query: 'Quel est l’état des lits disponibles et des services en tension ?',
          },
        ]
      : []),
    ...(seeBlood
      ? [
          {
            id: 'blood',
            title: 'Demandes de sang et stocks critiques',
            query: 'Analyse les demandes de sang ouvertes et les pénuries prévues à 7 jours.',
          },
        ]
      : []),
    ...(seeFleet
      ? [
          {
            id: 'fleet',
            title: 'Ambulances disponibles et missions en cours',
            query: 'Quel est l’état de la flotte d’ambulances et des missions SAMU ?',
          },
        ]
      : []),
  ]

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
      // Utilise le cache existant si l'appel échoue.
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
            ? 'Aucune capacité hospitalière n’est remontée pour le moment.'
            : `Il y a actuellement ${formatNumber(availBeds)} lits libres sur ${formatNumber(totalBeds)} (${formatPercent(globalBedRate)} d’occupation). ${
                tenseBeds.length > 0
                  ? `${tenseBeds.length} service(s) dépassent 85 % d’occupation.`
                  : 'Aucun service ne dépasse le seuil de 85 %.'
              }`,
        tableHeaders: ['Service', 'Disponibilité', 'Occupation'],
        tableRows: [...bedRows]
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 5)
          .map((r) => ({
            col1: r.label,
            col2: `${r.available} / ${r.total} libres`,
            col3: formatPercent(r.rate),
          })),
        bullets:
          tenseBeds.length > 0
            ? [
                `Services à surveiller en priorité : ${tenseBeds
                  .slice(0, 2)
                  .map((t) => t.label)
                  .join(', ')}.`,
              ]
            : undefined,
        actionLink: { to: '/beds', label: 'Voir la page Lits' },
      }
    }

    if (q.includes('sang') || q.includes('pénurie') || q.includes('poche') || q.includes('donneur') || q.includes('groupe')) {
      return {
        summary: `On compte ${openReqs.length} demande(s) de sang ouverte(s) pour un besoin total de ${formatNumber(missingUnits)} poche(s), dont ${criticalReqs.length} en urgence vitale. Les prévisions à 7 jours indiquent ${critPredCount} alerte(s) critique(s).`,
        tableHeaders: ['Groupe', 'Établissement', 'Besoin'],
        tableRows: openReqs.slice(0, 5).map((r) => ({
          col1: r.blood_group,
          col2: r.facility?.name || 'Établissement',
          col3: `${r.units_remaining} poche(s) · ${r.urgency_display}`,
        })),
        bullets:
          criticalReqs.length > 0
            ? [`Urgence vitale en cours pour : ${criticalReqs.map((r) => r.blood_group).join(', ')}.`]
            : undefined,
        actionLink: { to: '/blood', label: 'Voir la Banque de sang' },
      }
    }

    if (q.includes('ambulance') || q.includes('samu') || q.includes('mission') || q.includes('flotte')) {
      return {
        summary: `${availAmb} ambulance(s) sur ${totalAmb} sont disponibles. Il y a ${ctx.activeMissions.length} mission(s) active(s), dont ${pendingMissions.length} en attente d’affectation.`,
        tableHeaders: ['Mission', 'Lieu', 'Véhicule'],
        tableRows: ctx.activeMissions.slice(0, 5).map((m) => ({
          col1: m.description || `Mission #${m.id}`,
          col2: m.pickup_address || '—',
          col3: m.ambulance ? m.ambulance.plate_number : 'En attente',
        })),
        actionLink: { to: '/ambulances', label: 'Voir la flotte SAMU' },
      }
    }

    const bullets: string[] = []
    if (seeBeds) {
      bullets.push(
        `Lits : ${formatNumber(availBeds)} libre(s) sur ${formatNumber(totalBeds)} (${formatPercent(globalBedRate)} d’occupation).`
      )
    }
    if (seeBlood) {
      bullets.push(
        `Sang : ${openReqs.length} demande(s) ouverte(s) (${criticalReqs.length} vitale(s)) et ${critPredCount} risque(s) de pénurie à 7 jours.`
      )
    }
    if (seeFleet) {
      bullets.push(
        `SAMU : ${availAmb}/${totalAmb} ambulance(s) disponible(s), ${pendingMissions.length} mission(s) en attente.`
      )
    }

    return {
      summary: 'Voici le point de situation actuel sur votre périmètre :',
      bullets,
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
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    const [responseBlock] = await Promise.all([
      buildAnalyticalResponse(trimmed),
      new Promise((resolve) => setTimeout(resolve, 180)),
    ])

    msgSeqRef.current += 1
    const aiMsg: ChatMessage = {
      id: `a-${msgSeqRef.current}`,
      sender: 'ai',
      response: responseBlock,
    }
    setIsThinking(false)
    setMessages((prev) => [...prev, aiMsg])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/25 transition-opacity dark:bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Jappo IA — Assistant"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <aside className="relative flex h-full w-full max-w-[440px] flex-col border-l border-line bg-surface text-fg shadow-xl">
        {/* En-tête sobre style Claude / ChatGPT */}
        <header className="flex h-13 shrink-0 items-center justify-between border-b border-line px-4">
          <span className="text-sm font-semibold text-fg">Assistant</span>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-raised hover:text-fg"
                title="Nouvelle discussion"
                aria-label="Nouvelle discussion"
              >
                <SquarePen className="h-4 w-4" />
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

        {/* Corps : État d'accueil sobre ou fil de discussion */}
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col justify-center px-6 pb-8">
            <h2 className="text-xl font-semibold tracking-tight text-fg">
              {hasPersonalName ? `Bonjour ${rawFirst},` : 'Bonjour,'}
            </h2>
            <p className="mt-1 text-sm text-muted">Que souhaitez-vous vérifier aujourd’hui ?</p>

            <div className="mt-6 space-y-2" aria-label="Suggestions">
              {quickPrompts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => submitQuery(item.query)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-line bg-canvas/50 px-3.5 py-2.5 text-left text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-raised"
                >
                  <span>{item.title}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {messages.map((msg) =>
              msg.sender === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[82%] rounded-2xl bg-raised px-4 py-2.5 text-xs leading-relaxed text-fg">
                    {msg.prompt}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="space-y-3 text-xs leading-relaxed text-fg">
                  {msg.response && (
                    <>
                      <p>{msg.response.summary}</p>

                      {msg.response.bullets && msg.response.bullets.length > 0 && (
                        <ul className="list-disc space-y-1.5 pl-4 text-fg">
                          {msg.response.bullets.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      )}

                      {msg.response.tableRows && msg.response.tableRows.length > 0 && msg.response.tableHeaders && (
                        <div className="overflow-hidden rounded-xl border border-line">
                          <table className="w-full text-left text-xs">
                            <thead className="border-b border-line bg-subtle/60 text-muted">
                              <tr>
                                <th className="px-3 py-2 font-medium">{msg.response.tableHeaders[0]}</th>
                                <th className="px-3 py-2 font-medium">{msg.response.tableHeaders[1]}</th>
                                <th className="px-3 py-2 text-right font-medium">{msg.response.tableHeaders[2]}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {msg.response.tableRows.map((row, rIdx) => (
                                <tr key={`${row.col1}-${rIdx}`}>
                                  <td className="px-3 py-2 font-medium text-fg">{row.col1}</td>
                                  <td className="px-3 py-2 text-muted">{row.col2}</td>
                                  <td className="num px-3 py-2 text-right text-fg">{row.col3}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {msg.response.actionLink && (
                        <div>
                          <Link
                            to={msg.response.actionLink.to}
                            onClick={onClose}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted underline underline-offset-4 hover:text-fg"
                          >
                            {msg.response.actionLink.label}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            )}

            {isThinking && (
              <div role="status" aria-live="polite" className="text-xs text-muted">
                Recherche en cours…
              </div>
            )}
          </div>
        )}

        {/* Champ de saisie sobre style ChatGPT / Claude */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitQuery(input)
          }}
          className="shrink-0 p-4 pt-2"
        >
          <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-raised/40 px-3.5 py-2 focus-within:border-fg/40 focus-within:bg-surface">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Poser une question…"
              aria-label="Question pour l’assistant IA"
              className="w-full bg-transparent text-xs text-fg placeholder:text-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || isThinking}
              aria-label="Envoyer la question"
              className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fg text-canvas transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-25"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
