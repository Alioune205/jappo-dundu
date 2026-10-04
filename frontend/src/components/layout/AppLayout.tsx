import React from 'react'
import { Outlet, useLocation } from 'react-router'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useFallbackPolling } from '@/lib/useFallbackPolling'

export const AppLayout: React.FC = () => {
  const { pathname } = useLocation()
  // Flux temps réel coupé : relevé périodique des données affichées.
  useFallbackPolling()

  return (
    <div className="flex h-full bg-canvas text-fg">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          {/* Une panne de module laisse la navigation et l'en-tête utilisables. */}
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
