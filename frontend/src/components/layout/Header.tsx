import React, { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatTime } from '@/lib/format'

interface HeaderProps {
  title?: string
  subtitle?: string
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { logout } = useAuth()
  const { isConnected, alerts, unreadCount, markAllAsRead, clearAlerts } = useRealtime()
  const [showAlertsMenu, setShowAlertsMenu] = useState(false)

  return (
    <header className="h-16 border-b border-white/[0.08] bg-ink-950/40 backdrop-blur-xl px-8 flex items-center justify-between sticky top-0 z-30">
      <div>
        {title && <h1 className="text-base font-bold text-ink-100 tracking-tight">{title}</h1>}
        {subtitle && <p className="text-xs text-ink-400 -mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Statut WebSocket */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink-900 border border-white/10 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
            }`}
          />
          <span className="text-ink-400 text-[11px] font-medium">
            {isConnected ? 'Direct (WebSocket)' : 'Hors-ligne'}
          </span>
        </div>

        {/* Centre de Notifications / Alertes */}
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAlertsMenu(!showAlertsMenu)}
            className="relative p-2 h-auto text-ink-300 hover:text-white rounded-xl"
            aria-label="Alertes"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-500 text-white font-bold text-[9px] flex items-center justify-center animate-bounce">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>

          {/* Menu déroulant des alertes */}
          {showAlertsMenu && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 surface border border-white/15 bg-ink-900/95 shadow-2xl rounded-2xl overflow-hidden z-50 animate-slide-up">
              <div className="p-3.5 border-b border-white/[0.08] flex items-center justify-between bg-ink-950/40">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-ink-100 uppercase tracking-wider">
                    Alertes en direct
                  </span>
                  <Badge tone={unreadCount > 0 ? 'danger' : 'neutral'} size="sm">
                    {alerts.length}
                  </Badge>
                </div>
                {alerts.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={markAllAsRead}
                      className="text-[11px] text-ink-400 hover:text-white underline cursor-pointer"
                    >
                      Tout lire
                    </button>
                    <span className="text-ink-600">•</span>
                    <button
                      onClick={clearAlerts}
                      className="text-[11px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
                    >
                      Effacer
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.04]">
                {alerts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-ink-500">
                    Aucune alerte récente reçue.
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3.5 hover:bg-white/[0.03] transition-colors text-xs space-y-1 ${
                        !alert.isRead ? 'bg-brand-500/[0.04]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink-200">{alert.title}</span>
                        <span className="text-[10px] text-ink-500">
                          {formatTime(alert.timestamp)}
                        </span>
                      </div>
                      <p className="text-ink-400 text-[11px] leading-relaxed">{alert.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Déconnexion rapide */}
        <Button
          variant="outline"
          size="sm"
          onClick={logout}
          className="text-xs text-ink-300 hover:text-rose-300 hover:border-rose-500/40"
        >
          Déconnexion
        </Button>
      </div>
    </header>
  )
}
