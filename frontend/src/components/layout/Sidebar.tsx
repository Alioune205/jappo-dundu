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
    <aside className="flex h-full w-16 shrink-0 select-none flex-col border-r border-line bg-sidebar text-sidebar-fg lg:w-60">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4 lg:px-5">
        <BrandMark className="h-7 w-7 shrink-0" />
        <span className="hidden text-[0.9375rem] font-semibold tracking-tight lg:inline">Jappo Dundu</span>
      </div>

      {user?.facility && (
        <div className="mx-3 mb-1 hidden rounded-lg border border-line bg-sidebar-raised px-3 py-2 lg:block">
          <div className="truncate text-xs font-medium" title={user.facility.name}>
            {user.facility.name}
          </div>
          <div className="truncate text-2xs capitalize text-sidebar-muted">{user.facility.region}</div>
        </div>
      )}

      <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-4 lg:px-3" aria-label="Navigation principale">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin)
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title}>
              <div className="hidden px-2.5 pb-1.5 text-2xs font-medium text-sidebar-muted lg:block">
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
                          `relative flex h-9 items-center justify-center gap-2.5 rounded-md px-2.5 text-sm transition-colors lg:justify-start ${
                            isActive
                              ? 'bg-sidebar-raised font-medium text-fg shadow-[var(--shadow-panel)] ring-1 ring-line'
                              : 'text-sidebar-muted hover:bg-raised hover:text-fg'
                          }`
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                        {hasBadge && (
                          <span className="num absolute right-1 top-1 h-2 w-2 rounded-full bg-critical lg:static lg:h-auto lg:w-auto lg:min-w-5 lg:rounded-full lg:px-1.5 lg:text-center lg:text-2xs lg:font-medium lg:text-white">
                            <span className="hidden lg:inline">{item.badge}</span>
                          </span>
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

      <div className="border-t border-line p-2.5 lg:p-3">
        <NavLink
          to="/profile"
          title="Mon profil"
          className={({ isActive }) =>
            `flex items-center justify-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-raised lg:justify-start ${
              isActive ? 'bg-raised' : ''
            }`
          }
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
            {initial}
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-sm font-medium">{user?.full_name || user?.username}</span>
            <span className="block text-2xs text-sidebar-muted">
              {user?.role === 'admin' ? 'Administrateur' : 'Personnel hospitalier'}
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
