import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, onSessionExpired } from '@/lib/api'
import { session } from '@/lib/session'
import type { Account, LoginResponse, Role } from '@/types/api'

interface AuthContextType {
  user: Account | null
  tokenUser: LoginResponse['user'] | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  hasRole: (...roles: Role[]) => boolean
  isAdmin: boolean
  isHospitalStaff: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<Account | null>(null)
  const [tokenUser, setTokenUser] = useState<LoginResponse['user'] | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    try {
      const account = await api.get<Account>('/api/users/me/')
      setUser(account)
      setError(null)
    } catch {
      setUser(null)
      session.clear()
    }
  }, [])

  useEffect(() => {
    const initAuth = async () => {
      const refreshToken = session.getRefresh()
      if (refreshToken) {
        try {
          const res = await api.post<{ access: string; refresh: string }>('/api/auth/token/refresh/', {
            refresh: refreshToken,
          })
          session.setTokens(res.access, res.refresh || refreshToken)
          await fetchProfile()
        } catch {
          session.clear()
        }
      }
      setIsLoading(false)
    }

    initAuth()

    const unsubscribe = onSessionExpired(() => {
      setUser(null)
      setTokenUser(null)
    })

    return unsubscribe
  }, [fetchProfile])

  const login = async (username: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await api.post<LoginResponse>('/api/auth/token/', { username, password })
      session.setTokens(data.access, data.refresh)
      setTokenUser(data.user)
      await fetchProfile()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Identifiants invalides'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    const refresh = session.getRefresh()
    if (refresh) {
      try {
        await api.post('/api/auth/logout/', { refresh })
      } catch {
        // Ignorer l'erreur réseau à la déconnexion
      }
    }
    session.clear()
    setUser(null)
    setTokenUser(null)
  }

  const hasRole = useCallback(
    (...roles: Role[]) => {
      if (!user) return false
      const userRoles = user.roles || (user.role ? [user.role] : [])
      return roles.some((r) => userRoles.includes(r))
    },
    [user]
  )

  const isAdmin = hasRole('admin')
  const isHospitalStaff = hasRole('hospital_staff')

  return (
    <AuthContext.Provider
      value={{
        user,
        tokenUser,
        isAuthenticated: !!user,
        isLoading,
        error,
        login,
        logout,
        refreshProfile: fetchProfile,
        hasRole,
        isAdmin,
        isHospitalStaff,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth doit être utilisé au sein d’un AuthProvider')
  }
  return context
}
