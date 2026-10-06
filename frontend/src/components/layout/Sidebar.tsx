import React from 'react'
import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  Droplets,
  BedDouble,
  Ambulance,
  BrainCircuit,
  Building2,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { BrandMark } from './BrandMark'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  badge?: number
  adminOnly?: boolean
}

interface NavSection {
  title: string
  items: NavItem[]
}

/**
 * Navigation principale. En dessous de lg, elle se réduit à une colonne
 * d'icônes pour laisser la place aux tableaux.
 */
export const Sidebar: React.FC = () => {
  const { user, isAdmin } = useAuth()
  const { unreadCount } = useRealtime()

  const navSections: NavSection[] = [
    {
      title: 'Supervision',
      items: [{ to: '/', label: 'Tableau de bord', icon: LayoutDashboard, badge: unreadCount }],
    },
    {
      title: 'Ressources',
      items: [
        { to: '/blood', label: 'Banque de sang', icon: Droplets },
        { to: '/beds', label: 'Capacité en lits', icon: BedDouble },
        { to: '/ambulances', label: 'Flotte SAMU', icon: Ambulance },
      ],
    },
    {
      title: 'Pilotage',
      items: [
        { to: '/ml', label: 'Prévisions de pénurie', icon: BrainCircuit },
        { to: '/facilities', label: 'Structures', icon: Building2, adminOnly: true },
      ],
    },
  ]

  const initial = (user?.full_name || user?.username || 'U').charAt(0).toUpperCase()

  return (
    <aside className="flex h-full w-16 shrink-0 select-none flex-col bg-sidebar text-sidebar-fg lg:w-64">
      <div className="flex h-16 shrink-0 items-center gap-3 px-3.5 lg:px-5">
        <BrandMark className="h-9 w-9 shrink-0" />
        <span className="hidden min-w-0 lg:block">
          <span className="block font-display text-lg font-semibold leading-tight tracking-tight">Jappo Dundu</span>
          <span className="block truncate text-2xs text-sidebar-muted">Urgences médicales · Sénégal</span>
        </span>
      </div>
      <div aria-hidden="true" className="tricolor mx-3.5 h-0.5 rounded-full opacity-90 lg:mx-5" />

      {user?.facility && (
        <div className="mx-3 mt-4 hidden rounded-md bg-sidebar-raised px-3 py-2.5 lg:block">
          <div className="text-2xs font-semibold uppercase tracking-wider text-gold">Établissement</div>
          <div className="mt-0.5 truncate text-sm font-semibold" title={user.facility.name}>
            {user.facility.name}
          </div>
          <div className="truncate text-2xs capitalize text-sidebar-muted">{user.facility.region}</div>
        </div>
      )}

      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4 lg:px-3" aria-label="Navigation principale">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin)
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title}>
              <div className="hidden px-2.5 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-sidebar-muted lg:block">
                {section.title}
              </div>
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  const hasBadge = item.badge !== undefined && item.badge > 0
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        title={item.label}
                        className={({ isActive }) =>
                          `relative flex h-10 items-center justify-center gap-3 rounded-md px-2.5 text-sm transition-colors lg:justify-start ${
                            isActive
                              ? 'bg-white/12 font-semibold text-white'
                              : 'text-sidebar-muted hover:bg-white/6 hover:text-white'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-gold" />
                            )}
                            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                            <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                            {hasBadge && (
                              <span className="num absolute right-1 top-1 h-2 w-2 rounded-full bg-flag-red lg:static lg:h-auto lg:w-auto lg:min-w-5 lg:rounded-full lg:px-1.5 lg:text-center lg:text-2xs lg:font-semibold lg:text-white">
                                <span className="hidden lg:inline">{item.badge}</span>
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/10 p-2.5 lg:p-3">
        <NavLink
          to="/profile"
          title="Mon profil"
          className={({ isActive }) =>
            `flex items-center justify-center gap-3 rounded-md p-1.5 transition-colors hover:bg-white/6 lg:justify-start ${
              isActive ? 'bg-white/12' : ''
            }`
          }
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-bold text-sidebar">
            {initial}
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-sm font-semibold text-white">{user?.full_name || user?.username}</span>
            <span className="block text-2xs text-sidebar-muted">
              {user?.role === 'admin' ? 'Administrateur' : 'Personnel hospitalier'}
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
