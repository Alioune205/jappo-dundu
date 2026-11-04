import React from 'react'
import { NavLink } from 'react-router'
import {
  ArrowRight,
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
import { canOpen, primaryRoleLabel } from '@/lib/access'
import { useAssistant } from '@/components/ai/useAssistant'
import { JappoEmblem } from '@/components/ai/JappoEmblem'

/** Raccourci affiché selon le système (⌘ sur Mac). */
const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

/**
 * Navigation principale. En dessous de lg, elle se réduit à une colonne
 * d'icônes pour laisser la place aux tableaux. L'entrée active est marquée
 * par un filet d'encre sur le bord, comme un onglet de classeur.
 */
export const Sidebar: React.FC = () => {
  const { user, isAdmin, roles } = useAuth()
  const { unreadCount } = useRealtime()
  const assistant = useAssistant()

  const navSections: NavSection[] = [
    {
      title: 'Supervision',
      items: [{ to: '/', label: 'Tableau de bord', icon: LayoutDashboard, badge: unreadCount }],
    },
    {
      title: 'Ressources',
      items: [
        { to: '/blood', label: 'Banque de sang', icon: Droplets },
        { to: '/beds', label: 'Lits', icon: BedDouble },
        { to: '/ambulances', label: 'Flotte SAMU', icon: Ambulance },
      ],
    },
    {
      title: 'Pilotage',
      items: [
        { to: '/ml', label: 'Prévisions de pénurie', icon: BrainCircuit },
        { to: '/facilities', label: 'Structures', icon: Building2 },
      ],
    },
    {
      title: 'Compte',
      items: [{ to: '/profile', label: 'Mon profil', icon: UserRound }],
    },
  ]

  return (
    <aside className="flex h-full w-[4.25rem] shrink-0 select-none flex-col border-r border-line bg-sidebar text-sidebar-fg lg:w-[16rem] lg:border-0 lg:bg-transparent">
      <div className="flex h-16 shrink-0 items-center gap-3 px-4 lg:px-5">
        <BrandMark className="h-9 w-9 shrink-0" />
        <span className="hidden min-w-0 lg:block">
          <BrandName className="block text-[1.0625rem] leading-tight" />
          <span className="block truncate text-2xs leading-snug text-sidebar-muted">
            {isAdmin ? 'Supervision nationale' : primaryRoleLabel(roles)}
          </span>
        </span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-2.5 py-5 lg:px-3" aria-label="Navigation principale">
        {navSections.map((section) => {
          // Chaque rôle ne voit que les modules qu'il peut ouvrir (lib/access.ts).
          const visibleItems = section.items.filter((item) => canOpen(roles, item.to))
          if (visibleItems.length === 0) return null

          return (
            <div key={section.title}>
              <div className="kicker hidden px-3 pb-2 lg:block">{section.title}</div>
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
                          `group relative flex h-10 items-center justify-center gap-3 rounded-xl px-3 text-sm transition-colors lg:justify-start ${
                            isActive
                              ? 'bg-surface font-semibold text-fg shadow-[0_1px_2px_rgb(16_24_40/0.06),0_0_0_1px_var(--line)]'
                              : 'font-medium text-sidebar-muted hover:bg-surface/60 hover:text-fg'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              aria-hidden="true"
                              className={`absolute -left-2.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-ink transition-[opacity,scale] duration-300 lg:-left-3 dark:bg-brand ${
                                isActive ? 'scale-100 opacity-100' : 'scale-y-0 opacity-0'
                              }`}
                            />
                            <Icon
                              className={`h-[1.125rem] w-[1.125rem] shrink-0 ${isActive ? 'text-fg' : ''}`}
                              strokeWidth={isActive ? 2.1 : 1.8}
                              aria-hidden="true"
                            />
                            <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                            {hasBadge && (
                              <span className="num absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-critical lg:static lg:flex lg:h-5 lg:w-auto lg:min-w-5 lg:items-center lg:justify-center lg:bg-ink lg:px-1.5 lg:text-[0.6875rem] lg:font-semibold lg:text-on-ink dark:lg:bg-brand dark:lg:text-on-brand">
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

      {user?.facility && (
        <div className="mx-5 mb-4 hidden border-t border-line pt-4 lg:block">
          <div className="kicker">Établissement</div>
          <div className="mt-1 truncate text-sm font-semibold text-fg" title={user.facility.name}>
            {user.facility.name}
          </div>
          <div className="truncate text-2xs text-sidebar-muted">{user.facility.region_display ?? user.facility.region}</div>
        </div>
      )}

      {/* Jappo IA : une carte d'encre, toujours à portée (raccourci clavier aussi). */}
      <div className="px-2.5 pb-3 lg:px-3">
        <button
          type="button"
          onClick={assistant.open}
          aria-haspopup="dialog"
          aria-expanded={assistant.isOpen}
          title={`Ouvrir Jappo IA (${SHORTCUT})`}
          className="ai-launcher group hidden w-full cursor-pointer rounded-[1.25rem] p-4 text-left transition-[translate] duration-300 hover:-translate-y-0.5 lg:block"
        >
          <span className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15">
              <JappoEmblem className="h-6 w-6 text-on-ink" pulseClassName="text-critical-on-ink" />
            </span>
            <kbd className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 font-sans text-[0.625rem] font-medium text-on-ink-muted">
              {SHORTCUT}
            </kbd>
          </span>
          <span className="mt-4 block text-sm font-semibold">
            Jappo IA <span className="sr-only">(assistant)</span>
          </span>
          <span className="mt-0.5 block text-2xs leading-relaxed text-on-ink-muted">
            Une question sur les lits, le sang ou le SAMU ? Réponse chiffrée et sourcée.
          </span>
          <span className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#0f2547] transition-colors group-hover:bg-white/90">
            Demander <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          onClick={assistant.open}
          aria-haspopup="dialog"
          aria-expanded={assistant.isOpen}
          aria-label="Ouvrir Jappo IA (assistant)"
          title={`Jappo IA (${SHORTCUT})`}
          className="ai-launcher mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full lg:hidden"
        >
          <JappoEmblem className="h-6 w-6 text-on-ink" pulseClassName="text-critical-on-ink" />
        </button>
      </div>
    </aside>
  )
}
