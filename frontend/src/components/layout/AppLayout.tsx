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
    <div className="flex h-full flex-col bg-canvas text-fg">
      {/* Bandeau aux couleurs nationales. */}
      <div aria-hidden="true" className="tricolor h-1 shrink-0" />
      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
            {/* Une panne de module laisse la navigation et l'en-tête utilisables. */}
            <div className="mx-auto w-full max-w-[1440px]">
              <ErrorBoundary resetKey={pathname}>
                <Outlet />
              </ErrorBoundary>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
