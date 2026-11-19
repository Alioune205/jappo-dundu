import React from 'react'
import { NavLink } from 'react-router'
import { LayoutDashboard, Droplets, BedDouble, Ambulance, BrainCircuit, Building2, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { BrandMark, BrandName } from './BrandMark'
import { canOpen, primaryRoleLabel } from '@/lib/access'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  badge?: number
}

interface NavGroup {
  title: string
  items: NavItem[]
}

/**
 * Navigation principale, sur le même plan que la page (maquette) : la marque
 * en tête, une rubrique « Menu » puis une rubrique « Général ». L'entrée
 * active est en gras, avec un trait d'encre sur le bord. En dessous de lg,
 * elle se réduit à une colonne d'icônes. La déconnexion est en bas ; le compte
 * connecté est dans l'en-tête ;
 * Jappo IA s'ouvre par la pastille flottante (AssistantLauncher).
 */
export const Sidebar: React.FC = () => {
  const { isAdmin, roles, logout } = useAuth()
  const { unreadCount } = useRealtime()

  const groups: NavGroup[] = [
    {
      title: 'Menu',
      items: [
        { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, badge: unreadCount },
        { to: '/blood', label: 'Banque de sang', icon: Droplets },
        { to: '/beds', label: 'Lits', icon: BedDouble },
        { to: '/ambulances', label: 'Flotte SAMU', icon: Ambulance },
        { to: '/ml', label: 'Prévisions de pénurie', icon: BrainCircuit },
      ],
    },
    {
      title: 'Général',
      items: [{ to: '/facilities', label: 'Structures', icon: Building2 }],
    },
  ]

  return (
    <aside className="sidebar-shell flex h-full w-[4.25rem] shrink-0 select-none flex-col text-sidebar-fg lg:w-[15.5rem]">
      {/* Marque : symbole et nom aux couleurs du logo. */}
      <div className="flex shrink-0 items-center justify-center gap-2.5 px-3 py-5 lg:justify-start lg:px-6 lg:pb-7 lg:pt-6">
        <BrandMark className="h-9 w-9 shrink-0" />
        <span className="hidden text-[1.1875rem] leading-none lg:block">
          <BrandName className="font-extrabold tracking-[-0.02em]" />
          <span className="sr-only">{isAdmin ? ' — Supervision nationale' : ` — ${primaryRoleLabel(roles)}`}</span>
        </span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 pb-4 lg:px-4" aria-label="Navigation principale">
        {groups.map((group) => {
          // Chaque rôle ne voit que les modules qu'il peut ouvrir (lib/access.ts).
          const visible = group.items.filter((item) => canOpen(roles, item.to))
          if (visible.length === 0) return null
          return (
            <div key={group.title}>
              <p className="hidden px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-sidebar-subtle lg:block">
                {group.title}
              </p>
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const Icon = item.icon
                  const hasBadge = item.badge !== undefined && item.badge > 0
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        title={item.label}
                        className={({ isActive }) =>
                          `relative flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm transition-colors lg:justify-start ${
                            isActive
                              ? 'font-bold text-sidebar-fg'
                              : 'font-medium text-sidebar-muted hover:bg-sunken hover:text-sidebar-fg'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <span
                                aria-hidden="true"
                                className="absolute -left-2.5 bottom-2 top-2 w-1 rounded-r-full bg-sidebar-active lg:-left-4"
                              />
                            )}
                            <Icon
                              className={`h-[1.125rem] w-[1.125rem] shrink-0 ${isActive ? 'text-sidebar-active' : ''}`}
                              strokeWidth={isActive ? 2.1 : 1.8}
                              aria-hidden="true"
                            />
                            <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                            {hasBadge && (
                              <span className="num absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical lg:static lg:flex lg:h-5 lg:w-auto lg:min-w-5 lg:items-center lg:justify-center lg:px-1.5 lg:text-[0.6875rem] lg:font-bold lg:text-white">
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

      {/* Déconnexion : en bas de la barre latérale. */}
      <div className="shrink-0 px-2.5 pb-5 pt-2 lg:px-4">
        <button
          type="button"
          onClick={logout}
          title="Se déconnecter"
          className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-muted transition-colors hover:bg-critical/10 hover:text-critical lg:justify-start"
        >
          <LogOut className="h-[1.125rem] w-[1.125rem] shrink-0" strokeWidth={1.8} aria-hidden="true" />
          <span className="hidden lg:inline">Se déconnecter</span>
          <span className="sr-only lg:hidden">Se déconnecter</span>
        </button>
      </div>
    </aside>
  )
}
