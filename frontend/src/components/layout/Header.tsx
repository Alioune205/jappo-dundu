import React, { useState, useEffect, useRef } from 'react'
import { Bell, LogOut, Sun, Moon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { useTheme } from '@/context/ThemeContext'
import { formatTime } from '@/lib/format'
import { useOnlineStatus } from '@/lib/useOnlineStatus'
import { FALLBACK_POLL_MS } from '@/lib/useFallbackPolling'
import type { RealtimeStatus } from '@/context/RealtimeContext'

interface HeaderProps {
  title?: string
  subtitle?: string
}

const dakarClock = new Intl.DateTimeFormat('fr-SN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Africa/Dakar',
})

const iconButton =
  'relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted transition-colors hover:bg-raised hover:text-fg'

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { logout } = useAuth()
  const { status, interruptedSince, alerts, unreadCount, markAllAsRead, clearAlerts } = useRealtime()
  const online = useOnlineStatus()
  const { theme, toggleTheme } = useTheme()
  const [showAlertsMenu, setShowAlertsMenu] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => dakarClock.format(new Date()))
  const alertsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(dakarClock.format(new Date())), 1000)
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
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 lg:px-6">
      <div className="min-w-0">
        {title && <h1 className="truncate text-sm font-semibold text-fg">{title}</h1>}
        {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-1">
        {/* État de la liaison : dit clairement quand les données ne sont plus en direct. */}
        <ConnectionStatus online={online} status={status} interruptedSince={interruptedSince} />

        <div className="mr-3 hidden items-baseline gap-1.5 border-l border-line pl-3 sm:flex">
          <time className="num text-sm text-fg">{currentTime}</time>
          <span className="text-2xs text-subtle">Dakar</span>
        </div>

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
              <span className="num absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] leading-none text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {showAlertsMenu && (
            <div className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-md border border-line-strong bg-surface sm:w-96">
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="eyebrow">
                  Alertes réseau <span className="num ml-1 text-fg">{alerts.length}</span>
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

              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {alerts.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-muted">Aucune alerte en cours.</li>
                ) : (
                  alerts.map((alert) => (
                    <li key={alert.id} className="relative space-y-0.5 px-3 py-2.5 text-xs">
                      {!alert.isRead && (
                        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-critical" />
                      )}
                      <div className="flex items-baseline justify-between gap-3">
                        <span className={`font-medium ${alert.isRead ? 'text-muted' : 'text-fg'}`}>
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
      ? { dot: 'live-pulse bg-ok', text: 'text-muted', label: 'Temps réel', title: 'Données mises à jour en direct.' }
      : status === 'interrupted'
        ? {
            dot: 'bg-warning',
            text: 'text-warning',
            label: `Flux interrompu${interruptedSince ? ` depuis ${formatTime(new Date(interruptedSince))}` : ''}`,
            title: `Reconnexion en cours. En attendant, les données sont relues toutes les ${pollSeconds} s.`,
          }
        : { dot: 'bg-subtle', text: 'text-muted', label: 'Connexion…', title: 'Ouverture du flux temps réel.' }

  return (
    <div className="mr-2 flex items-center gap-1.5 text-xs" role="status" title={state.title}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${state.dot}`} />
      <span className={state.text}>{state.label}</span>
      {online && status === 'interrupted' && (
        <span className="hidden text-2xs text-subtle lg:inline">· relevé toutes les {pollSeconds} s</span>
      )}
    </div>
  )
}
