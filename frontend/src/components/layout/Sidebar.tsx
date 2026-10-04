import React from 'react'
import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  Droplets,
  BedDouble,
  Ambulance,
  Activity,
  Building2,
  ShieldCheck,
  Building,
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

export const Sidebar: React.FC = () => {
  const { user, isAdmin } = useAuth()
  const { unreadCount } = useRealtime()

  const navSections: NavSection[] = [
    {
      title: 'SUPERVISION',
      items: [
        {
          to: '/',
          label: 'Tableau de bord',
          icon: LayoutDashboard,
          badge: unreadCount,
        },
      ],
    },
    {
      title: 'GESTION OPÉRATIONNELLE',
      items: [
        {
          to: '/blood',
          label: 'Banque de Sang',
          icon: Droplets,
        },
        {
          to: '/beds',
          label: 'Capacité en Lits',
          icon: BedDouble,
        },
        {
          to: '/ambulances',
          label: 'Flotte & SMUR',
          icon: Ambulance,
        },
      ],
    },
    {
      title: 'ANALYTIQUE & ADMIN',
      items: [
        {
          to: '/ml',
          label: 'Prévisions Pénuries (IA)',
          icon: Activity,
        },
        {
          to: '/facilities',
          label: 'Structures & Équipes',
          icon: Building2,
          adminOnly: true,
        },
      ],
    },
  ]

  return (
    <aside className="w-64 bg-[#090d16] border-r border-slate-800/80 flex flex-col justify-between shrink-0 h-screen sticky top-0 select-none">
      <div className="flex-1 overflow-y-auto">
        {/* Logo officiel & identité */}
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/80">
          <div className="w-9 h-9 rounded-lg bg-rose-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </div>
          <div className="overflow-hidden">
            <div className="font-bold text-sm text-slate-100 tracking-tight leading-none">
              Jappo Dundu
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wide mt-1 uppercase">
              Régulation Médicale SN
            </div>
          </div>
        </div>

        {/* Établissement de rattachement */}
        {user?.facility && (
          <div className="mx-3.5 my-3 p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
              <Building className="w-4 h-4 text-slate-300" />
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-slate-200 truncate leading-tight">
                {user.facility.name}
              </div>
              <div className="text-[10px] text-slate-400 truncate uppercase mt-0.5">
                Région : {user.facility.region}
              </div>
            </div>
          </div>
        )}

        {/* Navigation groupée */}
        <nav className="p-3 space-y-5">
          {navSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.adminOnly || isAdmin,
            )
            if (visibleItems.length === 0) return null

            return (
              <div key={section.title} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {section.title}
                </div>
                {visibleItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) =>
                        `group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                          isActive
                            ? 'bg-slate-800 text-white border-l-2 border-rose-500 shadow-sm'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850/60'
                        }`
                      }
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-600 text-white">
                          {item.badge}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            )
          })}
        </nav>
      </div>

      {/* Profil connecté en bas de page */}
      <div className="p-3 border-t border-slate-800/80 bg-[#090d16]">
        <NavLink
          to="/profile"
          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-850 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center font-bold text-xs text-rose-400 shrink-0">
            {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-xs font-semibold text-slate-200 truncate leading-tight">
              {user?.full_name || user?.username}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
              {user?.role === 'admin' ? (
                <>
                  <ShieldCheck className="w-3 h-3 text-emerald-400 inline" />
                  <span>Administrateur</span>
                </>
              ) : (
                <span>Personnel Hospitalier</span>
              )}
            </div>
          </div>
        </NavLink>
      </div>
    </aside>
  )
}
