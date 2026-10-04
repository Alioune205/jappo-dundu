import React, { useState, useEffect } from 'react'
import { Bell, LogOut, Clock } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { Badge } from '@/components/ui/Badge'
import { formatTime } from '@/lib/format'

interface HeaderProps {
  title?: string
  subtitle?: string
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle }) => {
  const { logout } = useAuth()
  const { isConnected, alerts, unreadCount, markAllAsRead, clearAlerts } = useRealtime()
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
    <header className="h-16 border-b border-slate-800/80 bg-[#090d16]/95 backdrop-blur px-8 flex items-center justify-between sticky top-0 z-30">
      <div>
        {title && <h1 className="text-base font-bold text-slate-100 tracking-tight">{title}</h1>}
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Horloge officielle Dakar */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentTime}</span>
        </div>

        <div className="h-4 w-px bg-slate-800 hidden sm:block" />

        {/* Statut WebSocket */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-emerald-400' : 'bg-rose-400'
            }`}
          />
          <span className="text-slate-400 text-[11px] font-medium">
            {isConnected ? 'Flux temps réel actif' : 'Reconnexion...'}
          </span>
        </div>

        {/* Centre de Notifications / Alertes */}
        <div className="relative">
          <button
            onClick={() => setShowAlertsMenu(!showAlertsMenu)}
            className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
            aria-label="Alertes"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {/* Menu déroulant des alertes */}
          {showAlertsMenu && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-800 bg-[#0f172a] shadow-2xl overflow-hidden z-50 animate-slide-up">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
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
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Tout marquer comme lu
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      onClick={clearAlerts}
                      className="text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Effacer
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/50">
                {alerts.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Aucune alerte opérationnelle en cours.
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-3 hover:bg-slate-800/40 transition-colors text-xs space-y-1 ${
                        !alert.isRead ? 'bg-rose-500/[0.04]' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200">{alert.title}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatTime(alert.timestamp)}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px] leading-relaxed">{alert.message}</p>
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
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Se déconnecter"
        >
          <LogOut className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Quitter</span>
        </button>
      </div>
    </header>
  )
}
