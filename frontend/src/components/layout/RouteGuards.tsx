import React, { Suspense } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/ui/Spinner'

const PageLoader: React.FC = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Spinner label="Chargement du module…" />
  </div>
)

export const SuspenseWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
)

export const RequireAuth: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <Spinner label="Ouverture de la session…" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
