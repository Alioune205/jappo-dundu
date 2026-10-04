import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext'
import { session } from '@/lib/session'

/**
 * Serveur simulé avec rotation des refresh tokens (comme le backend :
 * ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION) : un refresh token ne
 * sert qu'une fois, toute réutilisation reçoit 401.
 */
function rotatingServer() {
  let validRefresh = 'refresh-1'
  let refreshCalls = 0
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/api/auth/token/refresh/')) {
      refreshCalls += 1
      const { refresh } = JSON.parse(String(init?.body))
      // Latence réseau : les appels concurrents se chevauchent vraiment.
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (refresh !== validRefresh) {
        return new Response(JSON.stringify({ detail: 'Token is blacklisted' }), { status: 401 })
      }
      validRefresh = `refresh-${refreshCalls + 1}`
      return new Response(JSON.stringify({ access: 'access-ok', refresh: validRefresh }), { status: 200 })
    }
    if (url.endsWith('/api/users/me/')) {
      return new Response(JSON.stringify({ id: 1, username: 'admin', role: 'admin', roles: ['admin'] }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  })
  return { fetchMock, refreshCalls: () => refreshCalls }
}

const Probe: React.FC = () => {
  const { isLoading, isAuthenticated } = useAuth()
  return <span data-testid="state">{isLoading ? 'chargement' : isAuthenticated ? 'connecté' : 'déconnecté'}</span>
}

describe('AuthProvider — reprise de session au rechargement', () => {
  beforeEach(() => session.setTokens('access-expire', 'refresh-1'))
  afterEach(() => {
    session.clear()
    vi.unstubAllGlobals()
  })

  it('reste connecté même si l’initialisation s’exécute deux fois (StrictMode)', async () => {
    const server = rotatingServer()
    vi.stubGlobal('fetch', server.fetchMock)

    render(
      <React.StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </React.StrictMode>
    )

    await waitFor(() => expect(screen.getByTestId('state')).not.toHaveTextContent('chargement'))
    expect(screen.getByTestId('state')).toHaveTextContent(/^connecté$/)
    // Un seul rafraîchissement : l'ancien jeton n'a jamais été présenté deux fois.
    expect(server.refreshCalls()).toBe(1)
    expect(session.getRefresh()).toBe('refresh-2')
  })

  it('se déconnecte proprement si le refresh token est révoqué', async () => {
    session.setTokens('access-expire', 'refresh-revoque')
    vi.stubGlobal('fetch', rotatingServer().fetchMock)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent(/^déconnecté$/))
    expect(session.getRefresh()).toBeNull()
  })
})

describe('AuthProvider — erreurs passagères', () => {
  beforeEach(() => session.setTokens('access-expire', 'refresh-1'))
  afterEach(() => {
    session.clear()
    vi.unstubAllGlobals()
  })

  it('ne déconnecte pas sur une limitation de débit (429) : nouvelle tentative', async () => {
    let profileCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/api/auth/token/refresh/')) {
          return new Response(JSON.stringify({ access: 'a', refresh: 'refresh-2' }), { status: 200 })
        }
        profileCalls += 1
        // Premier essai refusé par la limitation de débit, le suivant passe.
        return profileCalls === 1
          ? new Response(JSON.stringify({ detail: 'Request was throttled.' }), { status: 429 })
          : new Response(JSON.stringify({ id: 1, username: 'admin', roles: ['admin'] }), { status: 200 })
      })
    )

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    )
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent(/^connecté$/), { timeout: 3000 })
    expect(profileCalls).toBe(2)
    expect(session.getRefresh()).toBe('refresh-2')
  })
})
