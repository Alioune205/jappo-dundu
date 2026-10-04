import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, refreshSession } from '@/lib/api'
import { clearSnapshot, hydrate, loadSnapshot, startPersisting } from '@/lib/persist'
import { unregisterPush } from '@/lib/push'
import { session } from '@/lib/session'
import type { Account, RegisterInput, TokenPair } from '@/types/api'

interface AuthContextValue {
  user: Account | null
  isAuthenticated: boolean
  /** Restauration de la session au démarrage en cours. */
  isRestoring: boolean
  login: (username: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  /** Ouvre une session avec une paire de jetons déjà obtenue (réinitialisation du mot de passe). */
  signInWithTokens: (tokens: TokenPair) => Promise<void>
  /** Connexion Google, Facebook ou Apple : jeton du fournisseur vérifié par le serveur. */
  socialLogin: (provider: SocialProvider, payload: Record<string, string>) => Promise<SocialLoginResult>
}

export type SocialProvider = 'google' | 'facebook' | 'apple'

export interface SocialLoginResult {
  created: boolean
  /** Téléphone et région renseignés ; sinon l'application les demande. */
  profileComplete: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const PROFILE_RETRIES = 3

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<Account | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const stopPersisting = useRef<(() => void) | null>(null)

  /** Efface tout ce qui appartient au compte : jetons, cache mémoire et cache disque. */
  const forget = useCallback(async () => {
    stopPersisting.current?.()
    stopPersisting.current = null
    await session.clear()
    queryClient.clear()
    await clearSnapshot()
    setUser(null)
  }, [queryClient])

  const fetchProfile = useCallback(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        setUser(await api.get<Account>('/api/users/me/'))
        return
      } catch (err) {
        const status = err instanceof ApiError ? err.status : 0
        // Seul un refus d'authentification ferme la session ; une coupure
        // réseau ou un 429 ne doit pas déconnecter le donneur.
        if (status === 401 || status === 403) {
          await forget()
          return
        }
        if (attempt >= PROFILE_RETRIES) throw err
        await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt))
      }
    }
  }, [forget])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!(await session.restore())) {
          await clearSnapshot()
          return
        }
        // Dernières données connues affichées tout de suite, rafraîchies ensuite.
        const snapshot = await loadSnapshot()
        if (snapshot) hydrate(queryClient, snapshot)
        const outcome = await refreshSession()
        if (outcome === 'rejected') {
          await forget()
        } else if (outcome === 'ok') {
          await fetchProfile().catch(() => {
            if (snapshot && !cancelled) setUser(snapshot.account)
          })
        } else if (snapshot) {
          // Hors ligne avec une session valide : mode consultation sur le cache ;
          // les requêtes se reconnectent d'elles-mêmes au retour du réseau.
          setUser(snapshot.account)
        }
      } catch {
        // Stockage illisible : écran de connexion.
      } finally {
        if (!cancelled) setIsRestoring(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchProfile, forget, queryClient])

  // Le cache disque suit le compte connecté.
  useEffect(() => {
    if (!user) return
    const stop = startPersisting(queryClient, user)
    stopPersisting.current = stop
    return () => {
      stop()
      if (stopPersisting.current === stop) stopPersisting.current = null
    }
  }, [user, queryClient])

  const startSession = useCallback(
    async (tokens: TokenPair) => {
      // Nouveau compte sur ce téléphone : rien du précédent ne doit subsister.
      queryClient.clear()
      await clearSnapshot()
      await session.setTokens(tokens.access, tokens.refresh)
      await fetchProfile()
    },
    [fetchProfile, queryClient]
  )

  const login = useCallback(
    async (username: string, password: string) => {
      await startSession(await api.post<TokenPair>('/api/auth/token/', { username, password }, false))
    },
    [startSession]
  )

  const register = useCallback(
    async (input: RegisterInput) => {
      await startSession(await api.post<TokenPair>('/api/users/register/', input, false))
    },
    [startSession]
  )

  const logout = useCallback(async () => {
    // Ordre : le jeton push se désactive tant que la session est valide,
    // puis le refresh token est révoqué. Une erreur réseau n'empêche pas
    // la déconnexion locale.
    await unregisterPush()
    const refresh = session.getRefresh()
    if (refresh) await api.post('/api/auth/logout/', { refresh }).catch(() => undefined)
    await forget()
  }, [forget])

  const socialLogin = useCallback(
    async (provider: SocialProvider, payload: Record<string, string>): Promise<SocialLoginResult> => {
      const data = await api.post<TokenPair & { created: boolean; profile_complete: boolean }>(
        `/api/auth/social/${provider}/`,
        payload,
        false
      )
      await startSession(data)
      return { created: data.created, profileComplete: data.profile_complete }
    },
    [startSession]
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isRestoring,
      login,
      register,
      logout,
      refreshProfile: fetchProfile,
      signInWithTokens: startSession,
      socialLogin,
    }),
    [user, isRestoring, login, register, logout, fetchProfile, startSession, socialLogin]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return context
}
