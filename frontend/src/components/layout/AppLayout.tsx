import React from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useFallbackPolling } from '@/lib/useFallbackPolling'
import { useAuth } from '@/context/AuthContext'
import { canOpen, primaryRoleLabel } from '@/lib/access'

/** Page hors du rôle (URL saisie à la main, ancien favori). */
const AccessDenied: React.FC<{ roleLabel: string }> = ({ roleLabel }) => (
  <div className="panel mx-auto mt-12 max-w-lg p-8 text-center">
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
      <ShieldAlert className="h-6 w-6" aria-hidden="true" />
    </span>
    <h1 className="mt-4 text-xl font-bold text-fg">Module non accessible</h1>
    <p className="mt-2 text-sm text-muted">
      Ce module ne relève pas de votre rôle ({roleLabel}). Contactez l'administrateur général si vous pensez
      que c'est une erreur.
    </p>
    <Link
      to="/"
      className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong"
    >
      Retour au tableau de bord
    </Link>
  </div>
)

export const AppLayout: React.FC = () => {
  const { pathname } = useLocation()
  const { roles } = useAuth()
  // Flux temps réel coupé : relevé périodique des données affichées.
  useFallbackPolling()

  return (
    <div className="flex h-full bg-canvas text-fg">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8 lg:px-10">
          {/* Une panne de module laisse la navigation et l'en-tête utilisables. */}
          <div className="mx-auto w-full max-w-[1320px]">
            <ErrorBoundary resetKey={pathname}>
              {canOpen(roles, pathname) ? <Outlet /> : <AccessDenied roleLabel={primaryRoleLabel(roles)} />}
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}
