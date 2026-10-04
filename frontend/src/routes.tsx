import React, { Suspense, lazy } from 'react'
import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/context/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const BloodManagement = lazy(() =>
  import('@/pages/BloodManagement').then(m => ({ default: m.BloodManagement })),
)
const BedsManagement = lazy(() =>
  import('@/pages/BedsManagement').then(m => ({ default: m.BedsManagement })),
)
const AmbulancesManagement = lazy(() =>
  import('@/pages/AmbulancesManagement').then(m => ({ default: m.AmbulancesManagement })),
)
const MLPredictions = lazy(() =>
  import('@/pages/MLPredictions').then(m => ({ default: m.MLPredictions })),
)
const FacilitiesManagement = lazy(() =>
  import('@/pages/FacilitiesManagement').then(m => ({ default: m.FacilitiesManagement })),
)
const Profile = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })))
const Login = lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })))
const NotFound = lazy(() => import('@/pages/NotFound').then(m => ({ default: m.NotFound })))

const PageLoader: React.FC = () => (
  <div className="p-8 flex items-center justify-center min-h-[40vh]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
      <span className="text-xs text-ink-400">Chargement du module...</span>
    </div>
  </div>
)

const SuspenseWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
)

const RequireAuth: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-rose-500/20 border-t-rose-500 animate-spin" />
        <span className="text-xs text-slate-400 font-medium tracking-wide">
          Initialisation de la session sécurisée...
        </span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export const routes = [
  {
    path: '/login',
    element: (
      <SuspenseWrapper>
        <Login />
      </SuspenseWrapper>
    ),
  },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: (
              <SuspenseWrapper>
                <Dashboard />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'blood',
            element: (
              <SuspenseWrapper>
                <BloodManagement />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'beds',
            element: (
              <SuspenseWrapper>
                <BedsManagement />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'ambulances',
            element: (
              <SuspenseWrapper>
                <AmbulancesManagement />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'ml',
            element: (
              <SuspenseWrapper>
                <MLPredictions />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'facilities',
            element: (
              <SuspenseWrapper>
                <FacilitiesManagement />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'profile',
            element: (
              <SuspenseWrapper>
                <Profile />
              </SuspenseWrapper>
            ),
          },
          {
            path: '*',
            element: (
              <SuspenseWrapper>
                <NotFound />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },
]
