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
    <aside className="flex h-full w-14 shrink-0 select-none flex-col border-r border-line bg-surface lg:w-56">
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-4">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-critical text-white"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="hidden text-sm font-semibold tracking-tight text-fg lg:inline">Jappo Dundu</span>
      </div>

      {user?.facility && (
        <div className="hidden border-b border-line px-4 py-3 lg:block">
          <div className="eyebrow">Établissement</div>
          <div className="mt-0.5 truncate text-xs font-medium text-fg" title={user.facility.name}>
            {user.facility.name}
          </div>
          <div className="truncate text-2xs text-muted">{user.facility.region}</div>
        </div>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3" aria-label="Navigation principale">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin)
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title}>
              <div className="eyebrow hidden px-2 pb-1 lg:block">{section.title}</div>
              <ul className="space-y-px">
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
                          `relative flex h-8 items-center justify-center gap-2.5 rounded px-2 text-sm transition-colors lg:justify-start ${
                            isActive
                              ? 'bg-raised font-medium text-fg'
                              : 'text-muted hover:bg-raised hover:text-fg'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-fg" />
                            )}
                            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                            {hasBadge && (
                              <span className="num absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-critical lg:static lg:h-auto lg:w-auto lg:rounded-sm lg:px-1 lg:text-2xs lg:text-white">
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

      <div className="border-t border-line p-2">
        <NavLink
          to="/profile"
          title="Mon profil"
          className={({ isActive }) =>
            `flex items-center justify-center gap-2.5 rounded p-1.5 transition-colors hover:bg-raised lg:justify-start ${
              isActive ? 'bg-raised' : ''
            }`
          }
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-line bg-raised text-xs font-medium text-fg">
            {initial}
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-xs font-medium text-fg">{user?.full_name || user?.username}</span>
            <span className="block text-2xs text-muted">
              {user?.role === 'admin' ? 'Administrateur' : 'Personnel hospitalier'}
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
