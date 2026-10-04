/** Rendu de test avec les fournisseurs de l'application (requêtes, routeur, thème). */
import React from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@/context/ThemeContext'

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // Pas de nouvelle tentative : une erreur simulée doit s'afficher tout de suite.
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })
}

export function renderWithProviders(
  ui: React.ReactElement,
  { client = createTestQueryClient(), route = '/', ...options }: RenderOptions & { client?: QueryClient; route?: string } = {}
) {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) }
}
