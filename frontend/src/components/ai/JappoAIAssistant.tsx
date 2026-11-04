import React, { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Activity, Ambulance, ArrowRight, ArrowUp, ArrowUpRight, BedDouble, Check, Droplets, RotateCcw, SquarePen, X } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { canManage, canView } from '@/lib/access'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { CountUp } from '@/components/dash/CountUp'
import { useReducedMotion } from '@/components/dash/useReducedMotion'
import { JappoEmblem } from './JappoEmblem'
import {
  SOURCE_LABEL,
  consult,
  detectIntent,
  sourcesFor,
  type AssistantAnswer,
  type SourceKey,
} from './assistantEngine'

interface JappoAIAssistantProps {
  isOpen: boolean
  onClose: () => void
}

type ChatMessage =
  | { id: string; sender: 'user'; prompt: string }
  | { id: string; sender: 'ai'; prompt: string; answer: AssistantAnswer }

interface Thinking {
  keys: SourceKey[]
  done: SourceKey[]
}

/** Clé de session : la mise en scène complète n'est jouée qu'une fois par session. */
const INTRO_KEY = 'jappo-dundu.ai-intro-seen'
/** Durée minimale de la trace de consultation (lisible, jamais bloquante). */
const MIN_THINKING_MS = 520
/** Durée de l'animation de fermeture. */
const CLOSE_MS = 200

const GENERIC_NAMES = new Set([
  'responsable',
  'admin',
  'administrateur',
  'gestionnaire',
  'regulateur',
  'régulateur',
  'user',
  'utilisateur',
  'super',
])

function introAlreadySeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Jappo IA : l'assistant des tableaux de bord.
 *
 * Première ouverture de la session : le panneau glisse, le réticule se
 * trace, l'emblème se dessine puis bat une fois, l'accueil et les
 * suggestions arrivent en cascade (moins d'une seconde, la saisie est
 * disponible tout de suite). Ouvertures suivantes : glissement court, la
 * conversation est conservée. Chaque réponse cite ses sources et leur âge.
 */
export const JappoAIAssistant: React.FC<JappoAIAssistantProps> = ({ isOpen, onClose }) => {
  const { user, roles } = useAuth()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const reduced = useReducedMotion()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [thinking, setThinking] = useState<Thinking | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const msgSeqRef = useRef(0)

  // Montage, ouverture et fermeture animée (état dérivé, sans effet).
  const [rendered, setRendered] = useState(isOpen)
  const [closing, setClosing] = useState(false)
  const [entrance, setEntrance] = useState<'intro' | 'return'>(() => (introAlreadySeen() ? 'return' : 'intro'))
  if (isOpen && !rendered) {
    setRendered(true)
    setClosing(false)
  }
  if (isOpen && closing) setClosing(false)
  if (!isOpen && rendered && !closing) setClosing(true)

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(
      () => {
        setRendered(false)
        setClosing(false)
        // Les ouvertures suivantes de la session sont discrètes.
        setEntrance('return')
      },
      reduced ? 0 : CLOSE_MS
    )
    return () => clearTimeout(timer)
  }, [closing, reduced])

  useEffect(() => {
    if (!rendered || entrance !== 'intro') return
    try {
      sessionStorage.setItem(INTRO_KEY, '1')
    } catch {
      // Stockage indisponible : la mise en scène sera simplement rejouée.
    }
  }, [rendered, entrance])

  const seeBlood = canView(roles, 'blood')
  const seeBeds = canView(roles, 'beds')
  const seeFleet = canManage(roles, 'ambulances')
  const access = { beds: seeBeds, blood: seeBlood, fleet: seeFleet }
  const domainsCount = [seeBeds, seeBlood, seeFleet].filter(Boolean).length

  const rawFirst = (user?.first_name || user?.full_name?.split(' ')[0] || '').trim()
  const hasPersonalName = rawFirst.length > 1 && !GENERIC_NAMES.has(rawFirst.toLowerCase())

  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => inputRef.current?.focus(), 40)
    // Horloge des fraîcheurs (« il y a 2 min ») pendant que le panneau est ouvert.
    const clock = setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      clearTimeout(timer)
      clearInterval(clock)
    }
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
    const el = scrollRef.current
    if (el && typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }, [messages, thinking, reduced])

  if (!rendered) return null

  const quickPrompts = [
    {
      id: 'global',
      icon: Activity,
      title: 'Point de situation général',
      query: 'Quelles sont les urgences prioritaires et tensions actuelles ?',
    },
    ...(seeBeds
      ? [
          {
            id: 'beds',
            icon: BedDouble,
            title: 'Lits & services hospitaliers en tension',
            query: 'Quel est l’état des lits disponibles et des services en tension ?',
          },
        ]
      : []),
    ...(seeBlood
      ? [
          {
            id: 'blood',
            icon: Droplets,
            title: 'Demandes de sang et stocks critiques',
            query: 'Analyse les demandes de sang ouvertes et les pénuries prévues à 7 jours.',
          },
        ]
      : []),
    ...(seeFleet
      ? [
          {
            id: 'fleet',
            icon: Ambulance,
            title: 'Ambulances disponibles et missions en cours',
            query: 'Quel est l’état de la flotte d’ambulances et des missions SAMU ?',
          },
        ]
      : []),
  ]

  const submitQuery = async (queryText: string) => {
    const trimmed = queryText.trim()
    if (!trimmed || thinking) return

    const intent = detectIntent(trimmed)
    const keys = sourcesFor(intent, access)
    msgSeqRef.current += 1
    setMessages((prev) => [...prev, { id: `u-${msgSeqRef.current}`, sender: 'user', prompt: trimmed }])
    setInput('')
    setThinking({ keys, done: [] })

    const { answer, answeredAt } = await consult(
      intent,
      keys,
      queryClient,
      user?.facility,
      (key) => setThinking((t) => (t ? { ...t, done: [...t.done, key] } : t)),
      MIN_THINKING_MS
    )

    msgSeqRef.current += 1
    setNow(answeredAt)
    setThinking(null)
    setMessages((prev) => [...prev, { id: `a-${msgSeqRef.current}`, sender: 'ai', prompt: trimmed, answer }])
  }

  const state = closing ? 'closing' : 'open'
  const welcome = messages.length === 0 && !thinking
  const status = !online
    ? { dot: 'bg-critical-on-ink', text: 'Hors ligne · données en cache uniquement' }
    : thinking
      ? { dot: 'bg-warning-on-ink live-pulse', text: 'Consultation des données…' }
      : { dot: 'bg-ok-on-ink', text: `Prêt · ${domainsCount} module${domainsCount > 1 ? 's' : ''} accessible${domainsCount > 1 ? 's' : ''}` }

  const toolbar = (
    <div className="flex items-center gap-1">
      {messages.length > 0 && (
        <button
          type="button"
          onClick={() => setMessages([])}
          disabled={thinking !== null}
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-on-ink-muted transition-colors hover:bg-white/10 hover:text-on-ink disabled:opacity-40"
          title="Nouvelle discussion"
          aria-label="Nouvelle discussion"
        >
          <SquarePen className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-on-ink-muted transition-colors hover:bg-white/10 hover:text-on-ink"
        aria-label="Fermer l’assistant IA"
        title="Fermer (Échap)"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end sm:p-3" data-state={state}>
      <div className="ai-scrim absolute inset-0" data-state={state} aria-hidden="true" onClick={onClose} />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Jappo IA — Assistant"
        data-entrance={entrance}
        data-state={state}
        className="ai-panel relative flex h-full w-full flex-col overflow-hidden text-fg sm:max-w-[480px] sm:rounded-[1.75rem]"
      >
        {welcome ? (
          /* Accueil : bandeau d'encre, radar et emblème. */
          <div className="ai-hero shrink-0 px-5 pb-7 pt-4">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-semibold text-on-ink">
                Jappo IA
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.625rem] font-medium text-on-ink-muted ring-1 ring-inset ring-white/15">
                  Assistant
                </span>
              </p>
              {toolbar}
            </div>

            <div className="relative mx-auto mt-1 h-44 w-full max-w-[22rem]" aria-hidden="true">
              <span className="ai-stage-line-x" />
              <span className="ai-stage-line-y" />
              {[200, 148, 100].map((size) => (
                <span
                  key={size}
                  className="ai-radar absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ width: size, height: size }}
                />
              ))}
              {[0, 1].map((k) => (
                <span
                  key={k}
                  className="ai-radar ai-radar-wave absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
                  style={{ '--k': k } as React.CSSProperties}
                />
              ))}
              <span className="ai-medallion-ink absolute left-1/2 top-1/2 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full">
                <JappoEmblem className="h-10 w-10 text-on-ink" pulseClassName="text-critical-on-ink" />
              </span>
            </div>

            <h2
              className="ai-step mt-2 text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.025em] text-on-ink"
              style={{ '--step': 0 } as React.CSSProperties}
            >
              {hasPersonalName ? `Bonjour ${rawFirst},` : 'Bonjour,'}
              <span className="block font-serif text-[1.875rem] font-normal italic tracking-[-0.01em] text-on-ink-muted">
                que souhaitez-vous vérifier ?
              </span>
            </h2>
            <p
              className="ai-step mt-4 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-2xs font-medium text-on-ink-muted ring-1 ring-inset ring-white/12"
              style={{ '--step': 1 } as React.CSSProperties}
              role="status"
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {online ? 'Connecté aux données du réseau · lecture seule' : status.text}
            </p>
          </div>
        ) : (
          /* Conversation : bandeau compact. */
          <header className="ai-hero flex h-16 shrink-0 items-center justify-between gap-3 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className={`ai-medallion-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${thinking ? 'ai-thinking' : ''}`}
              >
                <JappoEmblem className="h-5 w-5 text-on-ink" pulseClassName="text-critical-on-ink" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-sm font-semibold text-on-ink">Jappo IA</p>
                <p className="flex items-center gap-1.5 truncate text-2xs text-on-ink-muted" role="status">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
                  {status.text}
                </p>
              </div>
            </div>
            {toolbar}
          </header>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {welcome ? (
            <div className="px-5 pb-5 pt-5">
              <p className="ai-step kicker mb-3" style={{ '--step': 2 } as React.CSSProperties}>
                Suggestions
              </p>
              <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" aria-label="Suggestions">
                {quickPrompts.map((item, index) => {
                  const Icon = item.icon
                  return (
                    <li key={item.id} className="ai-step" style={{ '--step': index + 3 } as React.CSSProperties}>
                      <button
                        type="button"
                        onClick={() => submitQuery(item.query)}
                        className="group flex h-full w-full cursor-pointer flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-raised)]"
                      >
                        <span className="flex w-full items-center justify-between">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sunken text-fg transition-colors group-hover:bg-ink group-hover:text-on-ink">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <ArrowUpRight
                            className="h-4 w-4 text-subtle transition-[rotate,color] duration-300 group-hover:rotate-45 group-hover:text-fg"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="text-sm font-semibold leading-snug text-fg">{item.title}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="ai-step mt-5 text-xs leading-relaxed text-muted" style={{ '--step': 7 } as React.CSSProperties}>
                Chaque chiffre de mes réponses vient des données de votre périmètre, avec sa source et sa date. Je ne
                modifie jamais rien.
              </p>
            </div>
          ) : (
            <div className="space-y-6 px-5 py-5" aria-live="polite">
              {messages.map((msg) =>
                msg.sender === 'user' ? (
                  <div key={msg.id} className="ai-msg flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-sunken px-4 py-2.5 text-sm leading-relaxed text-fg">
                      {msg.prompt}
                    </p>
                  </div>
                ) : (
                  <AnswerView
                    key={msg.id}
                    answer={msg.answer}
                    now={now}
                    onNavigate={onClose}
                    onRetry={() => submitQuery(msg.prompt)}
                    busy={thinking !== null}
                  />
                )
              )}

              {thinking && (
                <div role="status" className="ai-msg flex gap-3">
                  <span className="ai-thinking flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink">
                    <JappoEmblem className="h-4 w-4 text-on-ink" pulseClassName="text-critical-on-ink" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">Consultation des données…</p>
                    {thinking.keys.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {thinking.keys.map((key, i) => {
                          const done = thinking.done.includes(key)
                          return (
                            <li
                              key={key}
                              className="ai-source-step flex items-center gap-2 text-xs text-muted"
                              style={{ '--i': i } as React.CSSProperties}
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded-full transition-colors ${
                                  done ? 'bg-ok/15 text-ok' : 'border border-dashed border-line-strong'
                                }`}
                              >
                                {done && <Check className="h-3 w-3" aria-hidden="true" />}
                              </span>
                              {SOURCE_LABEL[key]}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saisie */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submitQuery(input)
          }}
          className="shrink-0 bg-surface px-4 pb-4 pt-2"
        >
          <div className="flex items-end gap-2 rounded-[1.25rem] border border-line-strong bg-surface py-2 pl-4 pr-2 shadow-[0_1px_2px_rgb(16_24_40/0.05)] transition-[border-color,box-shadow] focus-within:border-fg/40 focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--focus)_12%,transparent)]">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitQuery(input)
                }
              }}
              placeholder="Une question sur les lits, le sang, le SAMU…"
              aria-label="Question pour l’assistant IA"
              className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-fg placeholder:text-subtle focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking !== null}
              aria-label="Envoyer la question"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brand text-on-brand transition-[opacity,scale] duration-150 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:scale-100"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 flex items-center justify-between gap-3 px-1 text-[0.6875rem] text-subtle">
            <span>Lecture seule · chiffres sourcés et datés</span>
            <span>
              <kbd className="font-sans">Entrée</kbd> envoyer · <kbd className="font-sans">Échap</kbd> fermer
            </span>
          </p>
        </form>
      </aside>
    </div>
  )
}

/** Réponse : texte, chiffres clés, tableau, puis sources datées. */
const AnswerView: React.FC<{
  answer: AssistantAnswer
  now: number
  onNavigate: () => void
  onRetry: () => void
  busy: boolean
}> = ({ answer, now, onNavigate, onRetry, busy }) => (
  <div className="ai-msg flex gap-3">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink">
      <JappoEmblem className="h-4 w-4 text-on-ink" pulseClassName="text-critical-on-ink" />
    </span>
    <div className="min-w-0 flex-1 space-y-3 text-sm leading-relaxed text-fg">
      <p>{answer.summary}</p>

      {answer.figures && answer.figures.length > 0 && (
        <dl className="grid grid-cols-3 gap-2">
          {answer.figures.map((f, i) => (
            <div
              key={f.label}
              className={`ai-row rounded-xl border px-3 py-2.5 ${f.alert ? 'border-critical/30 bg-critical/5' : 'border-line bg-raised'}`}
              style={{ '--i': i } as React.CSSProperties}
            >
              <dt className="truncate text-2xs text-muted">{f.label}</dt>
              <dd className="mt-0.5 flex items-baseline gap-1">
                <CountUp
                  value={f.value}
                  format={f.format === 'percent' ? (v) => formatPercent(v) : formatNumber}
                  className={`text-lg font-semibold leading-none ${f.alert ? 'text-critical' : 'text-fg'}`}
                />
                {f.unit && <span className="num truncate text-2xs text-muted">{f.unit}</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {answer.bullets && answer.bullets.length > 0 && (
        <ul className="space-y-1.5">
          {answer.bullets.map((b, i) => (
            <li key={i} className="ai-row flex gap-2" style={{ '--i': i + 2 } as React.CSSProperties}>
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-fg/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {answer.table && answer.table.rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line bg-raised text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{answer.table.headers[0]}</th>
                <th className="px-3 py-2 font-medium">{answer.table.headers[1]}</th>
                <th className="px-3 py-2 text-right font-medium">{answer.table.headers[2]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {answer.table.rows.map((row, i) => (
                <tr key={`${row[0]}-${i}`} className="ai-row" style={{ '--i': i + 3 } as React.CSSProperties}>
                  <td className="px-3 py-2 font-medium text-fg">{row[0]}</td>
                  <td className="px-3 py-2 text-muted">{row[1]}</td>
                  <td className="num px-3 py-2 text-right text-fg">{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {answer.notice && (
        <p className="flex items-start justify-between gap-3 rounded-xl border border-warning/25 bg-warning/8 px-3 py-2 text-xs text-fg">
          <span>{answer.notice}</span>
          {answer.sources.some((s) => s.updatedAt === null) && (
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 font-semibold text-fg hover:underline disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Réessayer
            </button>
          )}
        </p>
      )}

      {answer.action && (
        <Link
          to={answer.action.to}
          onClick={onNavigate}
          className="inline-flex items-center gap-1 text-xs font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
        >
          {answer.action.label}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      )}

      {answer.sources.length > 0 && (
        <div className="border-t border-line pt-2.5">
          <p className="kicker mb-1.5 text-[0.625rem]">Sources</p>
          <ul className="flex flex-wrap gap-1.5">
            {answer.sources.map((s) => {
              const stale = s.updatedAt !== null && now - s.updatedAt > 15 * 60_000
              return (
                <li
                  key={s.key}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] ${
                    s.updatedAt === null
                      ? 'border-dashed border-line-strong text-subtle'
                      : stale
                        ? 'border-warning/30 bg-warning/8 text-warning'
                        : 'border-line text-muted'
                  }`}
                >
                  <span className="font-medium text-fg/85">{s.label}</span>
                  <span aria-hidden="true">·</span>
                  {s.updatedAt === null ? 'indisponible' : formatRelative(new Date(s.updatedAt), now)}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  </div>
)
