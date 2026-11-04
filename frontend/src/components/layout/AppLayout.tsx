import React from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { ShieldAlert } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useFallbackPolling } from '@/lib/useFallbackPolling'
import { useAuth } from '@/context/AuthContext'
import { useIdleLogout } from '@/lib/useIdleLogout'
import { CriticalAlertsBanner } from './CriticalAlertsBanner'
import { AssistantProvider } from '@/components/ai/AssistantContext'
import { canOpen, primaryRoleLabel } from '@/lib/access'
import { FULL_FEATURES } from '@/lib/features'

/** Page hors du rôle (URL saisie à la main, ancien favori). */
const AccessDenied: React.FC<{ roleLabel: string }> = ({ roleLabel }) => (
  <div className="panel mx-auto mt-12 max-w-lg p-8 text-center">
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-fg">
      <ShieldAlert className="h-6 w-6" aria-hidden="true" />
    </span>
    <h1 className="mt-4 text-xl font-bold text-fg">Module non accessible</h1>
    <p className="mt-2 text-sm text-muted">
      Ce module ne relève pas de votre rôle ({roleLabel}). Contactez l'administrateur général si vous pensez que c'est
      une erreur.
    </p>
    <Link
      to="/"
      className="mt-6 inline-flex h-10 items-center rounded-full bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
    >
      Retour au tableau de bord
    </Link>
  </div>
)

export const AppLayout: React.FC = () => {
  const { pathname } = useLocation()
  const { roles, logout } = useAuth()
  // Flux temps réel coupé : relevé périodique des données affichées.
  useFallbackPolling()
  // Poste partagé : déconnexion après une longue inactivité (avertissement 2 min avant).
  const idleWarning = useIdleLogout(logout)

  return (
    <AssistantProvider>
      {/*
       * Un seul plan : la navigation et le contenu partagent le même fond
       * clair, seules les cartes blanches s'en détachent.
       */}
      <div className="flex h-full bg-canvas text-fg print:block">
        <div className="contents print:hidden">
          <Sidebar />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
          <div className="print:hidden">
            <Header />
          </div>
          {FULL_FEATURES && <CriticalAlertsBanner />}
          {idleWarning && (
            <div
              role="alert"
              className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-xs font-semibold text-fg"
            >
              Sans activité, vous serez déconnecté dans moins de 2 minutes. Touchez l’écran pour rester connecté.
            </div>
          )}
          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-14 pt-6 lg:pl-4 lg:pr-8">
            {/* Une panne de module laisse la navigation et l'en-tête utilisables. */}
            {/* La clé rejoue l'entrée de page à chaque changement de module. */}
            <div key={pathname} className="page-enter mx-auto w-full max-w-[1380px]">
              <ErrorBoundary resetKey={pathname}>
                {canOpen(roles, pathname) ? <Outlet /> : <AccessDenied roleLabel={primaryRoleLabel(roles)} />}
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </AssistantProvider>
  )
}
