import React, { useState, useEffect } from 'react'
import { Bell, LogOut, Clock, Sun, Moon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { useTheme } from '@/context/ThemeContext'
import { Badge } from '@/components/ui/Badge'
import { formatTime } from '@/lib/format'

interface HeaderProps {
  title?: string
  subtitle?: string
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { logout } = useAuth()
  const { isConnected, alerts, unreadCount, markAllAsRead, clearAlerts } = useRealtime()
  const { theme, toggleTheme } = useTheme()
  const [showAlertsMenu, setShowAlertsMenu] = useState(false)
  const [currentTime, setCurrentTime] = useState('')

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        new Intl.DateTimeFormat('fr-SN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'Africa/Dakar',
        }).format(now) + ' (Dakar)',
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <header className="h-16 border-b border-[var(--border-main)] bg-[var(--bg-surface)] px-6 flex items-center justify-between sticky top-0 z-30 transition-colors duration-200">
      <div>
        {title && <h1 className="text-base font-bold text-[var(--text-main)] tracking-tight">{title}</h1>}
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Horloge officielle Dakar */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-mono">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentTime}</span>
        </div>

        <div className="h-4 w-px bg-[var(--border-main)] hidden sm:block" />

        {/* Statut WebSocket */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-main)] text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <span className="text-[var(--text-muted)] text-[11px] font-medium">
            {isConnected ? 'Flux national actif' : 'Connexion...'}
          </span>
        </div>

        {/* Bouton bascule de thème : Mode Clinique / Salle de Crise */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-1.5 p-2 rounded-lg border border-[var(--border-main)] bg-[var(--bg-subtle)] hover:bg-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)] text-xs transition-colors cursor-pointer"
          title={theme === 'light' ? 'Activer le Mode Salle de Crise (Sombre)' : 'Activer le Mode Clinique (Clair)'}
        >
          {theme === 'light' ? (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline font-medium text-[11px]">Salle de Crise</span>
            </>
          ) : (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden md:inline font-medium text-[11px]">Mode Clinique</span>
            </>
          )}
        </button>

        {/* Centre de Notifications / Alertes */}
        <div className="relative">
          <button
            onClick={() => setShowAlertsMenu(!showAlertsMenu)}
            className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] rounded-lg hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer border border-[var(--border-main)] bg-[var(--bg-surface)]"
            aria-label="Alertes"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {/* Menu déroulant des alertes */}
          {showAlertsMenu && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[var(--border-main)] bg-[var(--bg-surface)] shadow-xl overflow-hidden z-50 animate-slide-up">
              <div className="p-3 border-b border-[var(--border-main)] flex items-center justify-between bg-[var(--bg-subtle)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-main)] uppercase tracking-wider">
                    Alertes Réseau
                  </span>
                  <Badge tone={unreadCount > 0 ? 'danger' : 'neutral'} size="sm">
                    {alerts.length}
                  </Badge>
                </div>
                {alerts.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={markAllAsRead}
                      className="text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer"
                    >
                      Tout marquer comme lu
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">•</span>
                    <button
                      onClick={clearAlerts}
                      className="text-rose-600 hover:text-rose-500 cursor-pointer"
                    >
                      Effacer
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
                {alerts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                    Aucune alerte opérationnelle en cours.
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 hover:bg-[var(--bg-subtle)] transition-colors text-xs space-y-1 ${
                        !alert.isRead ? 'bg-rose-500/5' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--text-main)]">{alert.title}</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                          {formatTime(alert.timestamp)}
                        </span>
                      </div>
                      <p className="text-[var(--text-muted)] text-[11px] leading-relaxed">{alert.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Déconnexion */}
        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-main)] hover:border-rose-300 dark:hover:border-rose-900 bg-[var(--bg-surface)] hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-medium text-[var(--text-muted)] hover:text-rose-600 transition-colors cursor-pointer"
          title="Se déconnecter"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Quitter</span>
        </button>
      </div>
    </header>
  )
}
