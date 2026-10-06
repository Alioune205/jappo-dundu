import React from 'react'
import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  Droplets,
  BedDouble,
  Ambulance,
  BrainCircuit,
  Building2,
  UserRound,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { BrandMark, BrandName } from './BrandMark'

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
    {
      title: 'Compte',
      items: [{ to: '/profile', label: 'Mon profil', icon: UserRound }],
    },
  ]

  return (
    <aside className="flex h-full w-16 shrink-0 select-none flex-col border-r border-line bg-sidebar text-sidebar-fg lg:w-64">
      <div className="flex h-20 shrink-0 items-center gap-3 border-b border-line px-3.5 lg:px-6">
        <BrandMark className="h-9 w-9 shrink-0" />
        <span className="hidden min-w-0 lg:block">
          <BrandName className="block text-xl leading-tight" />
          <span className="block truncate text-2xs text-sidebar-muted">
            {isAdmin ? 'Supervision nationale' : 'Espace hôpital'}
          </span>
        </span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-6 lg:px-4" aria-label="Navigation principale">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin)
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title}>
              <div className="hidden px-3 pb-2 text-2xs font-semibold uppercase tracking-wider text-subtle lg:block">
                {section.title}
              </div>
              <ul className="space-y-1">
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
                          `relative flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors lg:justify-start ${
                            isActive
                              ? 'bg-sidebar-raised font-semibold text-brand'
                              : 'font-medium text-sidebar-muted hover:bg-raised hover:text-fg'
                          }`
                        }
                      >
                        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                        {hasBadge && (
                          <span className="num absolute right-1 top-1 h-2 w-2 rounded-full bg-brand lg:static lg:flex lg:h-5 lg:w-auto lg:min-w-5 lg:items-center lg:justify-center lg:px-1.5 lg:text-2xs lg:font-semibold lg:text-white">
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

      {user?.facility && (
        <div className="mx-4 mb-4 hidden rounded-xl border border-line bg-raised px-3.5 py-3 lg:block">
          <div className="text-2xs font-medium text-subtle">Établissement</div>
          <div className="mt-0.5 truncate text-sm font-semibold" title={user.facility.name}>
            {user.facility.name}
          </div>
          <div className="truncate text-2xs capitalize text-sidebar-muted">{user.facility.region}</div>
        </div>
      )}
    </aside>
  )
}
