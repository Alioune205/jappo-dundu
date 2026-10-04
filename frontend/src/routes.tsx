import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth, SuspenseWrapper } from '@/components/layout/RouteGuards'
import { RouteError } from '@/components/ErrorBoundary'
import {
  Dashboard,
  BloodManagement,
  BedsManagement,
  AmbulancesManagement,
  MLPredictions,
  FacilitiesManagement,
  Profile,
  Login,
  NotFound,
} from '@/pages/lazy'

export const routes = [
  {
    path: '/login',
    errorElement: <RouteError />,
    element: (
      <SuspenseWrapper>
        <Login />
      </SuspenseWrapper>
    ),
  },
  {
    path: '/',
    element: <RequireAuth />,
    errorElement: <RouteError />,
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
