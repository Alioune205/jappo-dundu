import React from 'react'
import { NavLink } from 'react-router'
import { LayoutDashboard, Droplets, BedDouble, Ambulance, BrainCircuit, Building2, Heart } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useRealtime } from '@/context/RealtimeContext'
import { BrandMark } from './BrandMark'
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

/**
 * Navigation principale, sur une colonne bleu nuit : la marque en tête, les
 * modules, le slogan illustré, puis le compte connecté (qui mène au profil).
 * En dessous de lg, elle se réduit à une colonne d'icônes. L'entrée active
 * est un aplat bleu vif.
 */
export const Sidebar: React.FC = () => {
  const { user, isAdmin, roles } = useAuth()
  const { unreadCount } = useRealtime()
  const assistant = useAssistant()

  const groups: NavItem[][] = [
    [{ to: '/', label: 'Tableau de bord', icon: LayoutDashboard, badge: unreadCount }],
    [
      { to: '/blood', label: 'Banque de sang', icon: Droplets },
      { to: '/beds', label: 'Lits', icon: BedDouble },
      { to: '/ambulances', label: 'Flotte SAMU', icon: Ambulance },
    ],
    [
      { to: '/ml', label: 'Prévisions de pénurie', icon: BrainCircuit },
      { to: '/facilities', label: 'Structures', icon: Building2 },
    ],
  ]

  const displayName = user?.full_name || user?.username || ''
  const initials =
    displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'U'

  return (
    <aside className="sidebar-shell flex h-full w-[4.25rem] shrink-0 select-none flex-col text-sidebar-fg lg:w-[16rem]">
      {/* Marque : symbole, nom et devise du logo. */}
      <div className="flex shrink-0 items-center justify-center px-3 py-5 lg:flex-col lg:gap-2 lg:px-5 lg:pb-6 lg:pt-7">
        <BrandMark onDark className="h-10 w-10 shrink-0 lg:h-14 lg:w-14" />
        <span className="hidden text-center lg:block">
          <span className="block text-[1.3125rem] font-extrabold leading-tight tracking-[-0.02em] text-white">
            Jappo Dundu
          </span>
          <span className="mt-0.5 block text-2xs font-medium text-sidebar-muted">Connecter • Sauver • Vivre</span>
          <span className="sr-only">{isAdmin ? 'Supervision nationale' : primaryRoleLabel(roles)}</span>
        </span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 pb-4 lg:px-4" aria-label="Navigation principale">
        {groups.map((items, index) => {
          // Chaque rôle ne voit que les modules qu'il peut ouvrir (lib/access.ts).
          const visible = items.filter((item) => canOpen(roles, item.to))
          if (visible.length === 0) return null
          return (
            <ul key={index} className="space-y-1">
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
                            ? 'bg-sidebar-active font-semibold text-white shadow-[0_10px_22px_-10px_rgb(29_94_224/0.85)]'
                            : 'font-medium text-sidebar-muted hover:bg-white/[0.07] hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <Icon className="h-[1.125rem] w-[1.125rem] shrink-0" strokeWidth={isActive ? 2.2 : 1.9} aria-hidden="true" />
                          <span className="hidden flex-1 truncate lg:inline">{item.label}</span>
                          {hasBadge && (
                            <span className="num absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#ff5a64] lg:static lg:flex lg:h-5 lg:w-auto lg:min-w-5 lg:items-center lg:justify-center lg:bg-[#e5484d] lg:px-1.5 lg:text-[0.6875rem] lg:font-bold lg:text-white">
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
          )
        })}
      </nav>

      {/* Slogan illustré, avec l'accès à Jappo IA (aussi au clavier : Ctrl K). */}
      <div className="px-2.5 pb-3 lg:px-4">
        <div className="sidebar-slogan relative hidden overflow-hidden rounded-2xl p-4 lg:block">
          <img
            src="/logo-mark-dark.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-5 -right-5 h-28 w-28 opacity-40"
          />
          <Heart className="h-6 w-6 text-white" strokeWidth={1.8} aria-hidden="true" />
          <p className="relative mt-2 max-w-[8.5rem] text-[0.9375rem] font-bold leading-snug text-white">
            Ensemble, sauvons des vies
          </p>
          <button
            type="button"
            onClick={assistant.open}
            aria-haspopup="dialog"
            aria-expanded={assistant.isOpen}
            title={`Ouvrir Jappo IA (${SHORTCUT})`}
            className="relative mt-3 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-white/12 px-3 text-xs font-semibold text-white ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/20"
          >
            <JappoEmblem className="h-4 w-4 text-white" pulseClassName="text-critical-on-ink" />
            Jappo IA
            <kbd className="font-sans text-[0.625rem] font-medium text-white/60">{SHORTCUT}</kbd>
          </button>
        </div>
        <button
          type="button"
          onClick={assistant.open}
          aria-haspopup="dialog"
          aria-expanded={assistant.isOpen}
          aria-label="Ouvrir Jappo IA (assistant)"
          title={`Jappo IA (${SHORTCUT})`}
          className="mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 lg:hidden"
        >
          <JappoEmblem className="h-6 w-6 text-white" pulseClassName="text-critical-on-ink" />
        </button>
      </div>

      {/* Compte connecté et établissement de rattachement. */}
      <NavLink
        to="/profile"
        title="Mon profil"
        className="flex items-center justify-center gap-3 border-t border-white/10 bg-black/15 px-3 py-3.5 transition-colors hover:bg-black/25 lg:justify-start lg:px-5"
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dce8fa] text-xs font-bold text-[#16417b]">
          {initials}
          <span aria-hidden="true" className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#12b76a] ring-2 ring-[#0a1838]" />
        </span>
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-xs font-semibold text-white">{displayName}</span>
          <span className="block truncate text-2xs text-sidebar-muted" title={user?.facility?.name}>
            {user?.facility?.name ?? primaryRoleLabel(roles)}
          </span>
        </span>
      </NavLink>
    </aside>
  )
}
