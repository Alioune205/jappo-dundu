import React from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  badge?: number
  adminOnly?: boolean
}

export const Sidebar: React.FC = () => {
  const { user, isAdmin } = useAuth()
  const { unreadCount } = useRealtime()

  const navItems: NavItem[] = [
    {
      to: '/',
      label: 'Tableau de bord',
      badge: unreadCount,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      ),
    },
    {
      to: '/blood',
      label: 'Banque de Sang',
      icon: (
        <svg className="w-5 h-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
          />
        </svg>
      ),
    },
    {
      to: '/beds',
      label: 'Gestion des Lits',
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
          />
        </svg>
      ),
    },
    {
      to: '/ambulances',
      label: 'Ambulances & SMUR',
      icon: (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      ),
    },
    {
      to: '/ml',
      label: 'Prévisions IA (ML)',
      icon: (
        <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      to: '/facilities',
      label: 'Établissements & Utilisateurs',
      icon: (
        <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      ),
      adminOnly: true,
    },
  ]

  return (
    <aside className="w-64 bg-ink-950/80 border-r border-white/[0.08] backdrop-blur-xl flex flex-col justify-between shrink-0 h-screen sticky top-0">
      <div>
        {/* Logo & Brand */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-white/[0.06]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-brand">
            <span className="text-lg">🩸</span>
          </div>
          <div>
            <div className="font-display font-bold text-base text-ink-100 tracking-tight flex items-center gap-1.5">
              Jappo Dundu
              <span className="text-[10px] uppercase font-bold tracking-widest text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded border border-brand-500/20">
                Web
              </span>
            </div>
            <div className="text-[10px] text-ink-400 -mt-0.5">Urgences Médicales SN</div>
          </div>
        </div>

        {/* Établissement rattaché */}
        {user?.facility && (
          <div className="mx-4 my-3 p-2.5 rounded-xl bg-ink-900/90 border border-white/[0.05] flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-xs shrink-0">
              🏥
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-ink-200 truncate">{user.facility.name}</div>
              <div className="text-[10px] text-ink-500 truncate capitalize">{user.facility.region}</div>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 select-none ${
                    isActive
                      ? 'bg-brand-600/15 text-brand-300 border border-brand-500/30 shadow-sm'
                      : 'text-ink-400 hover:text-ink-200 hover:bg-white/[0.04]'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-600 text-white">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Profil info bas de page */}
      <div className="p-4 border-t border-white/[0.06] bg-ink-900/40">
        <NavLink
          to="/profile"
          className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/[0.05] transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-ink-800 border border-white/10 flex items-center justify-center font-bold text-xs text-brand-400">
            {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-xs font-semibold text-ink-200 truncate">{user?.full_name}</div>
            <div className="text-[10px] text-ink-400 truncate capitalize">
              {user?.role === 'admin' ? 'Administrateur' : 'Personnel Hospitalier'}
            </div>
          </div>
        </NavLink>
      </div>
    </aside>
  )
}
