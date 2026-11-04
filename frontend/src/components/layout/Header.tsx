import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { Bell, LogOut, Sun, Moon, Search } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useAssistant } from '@/components/ai/useAssistant'
import { primaryRoleLabel } from '@/lib/access'
import { useRealtime } from '@/context/RealtimeContext'
import { useTheme } from '@/context/ThemeContext'
import { formatTime } from '@/lib/format'
import { notificationPermission, requestNotificationPermission } from '@/lib/browserNotifications'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { FALLBACK_POLL_MS } from '@/lib/useFallbackPolling'
import type { RealtimeStatus } from '@/context/RealtimeContext'

const dakarClock = new Intl.DateTimeFormat('fr-SN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Africa/Dakar',
})

const dakarDay = new Intl.DateTimeFormat('fr-SN', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'Africa/Dakar',
})

/** Libellé de la page courante (fil d'Ariane de l'en-tête). */
const PAGE_LABELS: Record<string, string> = {
  '/': 'Tableau de bord',
  '/blood': 'Banque de sang',
  '/beds': 'Lits',
  '/ambulances': 'Flotte SAMU',
  '/ml': 'Prévisions de pénurie',
  '/facilities': 'Structures',
  '/profile': 'Mon profil',
  '/rapport': 'Rapport',
}

const iconButton =
  'relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg hover:shadow-[var(--shadow-panel)]'

/** Raccourci affiché selon le système (⌘ sur Mac). */
const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

/**
 * En-tête de l'application, posé sur le fond : le champ de recherche (qui
 * ouvre Jappo IA), l'heure de Dakar sur grand écran, puis l'état de la
 * liaison temps réel et les outils (thème, alertes, compte).
 */
export const Header: React.FC = () => {
  const { logout, user, roles } = useAuth()
  const assistant = useAssistant()
  const displayName = user?.full_name || user?.username || ''
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'U'
  const { pathname } = useLocation()
  const pageLabel = PAGE_LABELS[`/${pathname.split('/')[1] ?? ''}`] ?? ''
  const { status, interruptedSince, alerts, unreadCount, markAllAsRead, clearAlerts } = useRealtime()
  const online = useOnlineStatus()
  const { theme, toggleTheme } = useTheme()
  const [showAlertsMenu, setShowAlertsMenu] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const alertsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fermeture du menu des alertes au clic extérieur ou sur Échap.
  useEffect(() => {
    if (!showAlertsMenu) return
    const onPointer = (e: PointerEvent) => {
      if (!alertsRef.current?.contains(e.target as Node)) setShowAlertsMenu(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAlertsMenu(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [showAlertsMenu])

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-4 bg-canvas/80 px-4 backdrop-blur-md lg:h-[4.75rem] lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {/* Champ de recherche : ouvre Jappo IA, qui répond sur les données du réseau. */}
          <button
            type="button"
            onClick={assistant.open}
            aria-haspopup="dialog"
            aria-expanded={assistant.isOpen}
            className="hidden h-11 w-full max-w-[28rem] cursor-pointer items-center gap-3 rounded-full bg-surface px-5 text-left text-sm text-muted shadow-[var(--shadow-panel)] transition-shadow hover:shadow-[var(--shadow-raised)] lg:flex"
          >
            <Search className="h-[1.125rem] w-[1.125rem] shrink-0 text-fg" aria-hidden="true" />
            <span className="flex-1 truncate">Rechercher, demander à Jappo IA…</span>
            <kbd className="rounded-md border border-line-strong px-1.5 py-0.5 font-sans text-[0.625rem] text-subtle">
              {SHORTCUT}
            </kbd>
          </button>
          {/* Petit écran : la page courante à la place du champ. */}
          <p aria-current="page" className="truncate text-sm font-semibold text-fg lg:hidden">
            {pageLabel}
          </p>
          <p className="hidden shrink-0 items-baseline gap-1.5 whitespace-nowrap text-xs text-muted 2xl:flex">
            <span className="first-letter:uppercase">{dakarDay.format(now)}</span>
            <time className="num font-medium text-fg">{dakarClock.format(now)}</time>
            <span className="text-subtle">Dakar</span>
          </p>
        </div>

        <div className="flex items-center gap-1">

          {/* État de la liaison : dit clairement quand les données ne sont plus en direct. */}
          <ConnectionStatus online={online} status={status} interruptedSince={interruptedSince} />

          <button
            type="button"
            onClick={toggleTheme}
            className={iconButton}
            aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="relative" ref={alertsRef}>
            <button
              type="button"
              onClick={() => setShowAlertsMenu((open) => !open)}
              className={iconButton}
              aria-label={unreadCount > 0 ? `Alertes (${unreadCount} non lues)` : 'Alertes'}
              aria-expanded={showAlertsMenu}
              aria-haspopup="true"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="num absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold leading-none text-on-critical ring-2 ring-canvas">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showAlertsMenu && (
              <div className="reveal absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-raised)] sm:w-96">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <span className="text-sm font-semibold text-fg">
                    Alertes réseau <span className="num ml-1 font-normal text-muted">{alerts.length}</span>
                  </span>
                  {alerts.length > 0 && (
                    <div className="flex items-center gap-3 text-xs">
                      <button type="button" onClick={markAllAsRead} className="cursor-pointer text-muted hover:text-fg">
                        Tout marquer lu
                      </button>
                      <button type="button" onClick={clearAlerts} className="cursor-pointer text-muted hover:text-critical">
                        Effacer
                      </button>
                    </div>
                  )}
                </div>

                <SystemNotificationsPrompt />
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {alerts.length === 0 ? (
                    <li className="px-4 py-8 text-center text-xs text-muted">Aucune alerte en cours.</li>
                  ) : (
                    alerts.map((alert) => (
                      <li key={alert.id} className="relative space-y-0.5 px-4 py-3 text-xs">
                        {!alert.isRead && (
                          <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-critical" />
                        )}
                        <div className="flex items-baseline justify-between gap-3">
                          <span className={`font-semibold ${alert.isRead ? 'text-muted' : 'text-fg'}`}>
                            {alert.title}
                            {!alert.isRead && <span className="sr-only"> (non lue)</span>}
                          </span>
                          <span className="num shrink-0 text-2xs text-subtle">{formatTime(alert.timestamp)}</span>
                        </div>
                        <p className="leading-relaxed text-muted">{alert.message}</p>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>

          <span aria-hidden="true" className="mx-2 hidden h-6 w-px bg-line-strong sm:block" />

          <Link
            to="/profile"
            className="flex items-center gap-3 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-surface sm:pr-3"
            title="Mon profil"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dce8fa] text-2xs font-bold text-[#16417b]">
              {initials}
            </span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block max-w-[14rem] truncate text-xs font-semibold text-fg">
                {user?.facility?.name ?? displayName}
              </span>
              <span className="block text-2xs text-muted">{primaryRoleLabel(roles)}</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={logout}
            className={`${iconButton} hover:text-critical`}
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

    </>
  )
}

interface ConnectionStatusProps {
  online: boolean
  status: RealtimeStatus
  interruptedSince: number | null
}

/** Pastille d'état : réseau perdu, flux interrompu (mode dégradé), connexion, ou temps réel. */
const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ online, status, interruptedSince }) => {
  const pollSeconds = Math.round(FALLBACK_POLL_MS / 1000)
  const state = !online
    ? {
        dot: 'bg-critical',
        text: 'text-critical',
        label: 'Hors ligne',
        title: 'Le poste n’a plus de connexion réseau : les données affichées ne sont plus mises à jour.',
      }
    : status === 'open'
      ? { dot: 'bg-ok', text: 'text-fg', label: 'Temps réel', title: 'Données mises à jour en direct.', live: true }
      : status === 'interrupted'
        ? {
            dot: 'bg-viz-warn',
            text: 'text-warning',
            label: `Flux interrompu${interruptedSince ? ` depuis ${formatTime(new Date(interruptedSince))}` : ''}`,
            title: `Reconnexion en cours. En attendant, les données sont relues toutes les ${pollSeconds} s.`,
          }
        : { dot: 'bg-subtle', text: 'text-muted', label: 'Connexion…', title: 'Ouverture du flux temps réel.' }

  return (
    <div
      className="hidden items-center gap-2 whitespace-nowrap rounded-full border border-line bg-raised px-3 py-1 text-xs font-medium sm:flex"
      role="status"
      title={state.title}
    >
      <span aria-hidden="true" className={`relative flex h-2 w-2 rounded-full ${state.dot}`}>
        {'live' in state && <span className={`ping-ring absolute inset-0 rounded-full text-ok`} />}
      </span>
      <span className={state.text}>{state.label}</span>
      {online && status === 'interrupted' && (
        <span className="hidden text-2xs text-subtle lg:inline">· relevé toutes les {pollSeconds} s</span>
      )}
    </div>
  )
}

/** Propose d'activer les notifications du système : une alerte reçue onglet caché reste visible. */
const SystemNotificationsPrompt: React.FC = () => {
  const [permission, setPermission] = useState(notificationPermission)
  if (permission !== 'default') return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-raised px-4 py-2.5 text-xs">
      <span className="text-muted">Être prévenu même quand cet onglet est en arrière-plan.</span>
      <button
        type="button"
        className="shrink-0 cursor-pointer font-semibold text-fg underline-offset-4 hover:underline"
        onClick={() => requestNotificationPermission().then(setPermission)}
      >
        Activer
      </button>
    </div>
  )
}
