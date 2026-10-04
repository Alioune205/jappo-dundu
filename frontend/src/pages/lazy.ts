/** Pages chargées à la demande (un fichier JS par module). */
import { lazy } from 'react'

export const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
export const BloodManagement = lazy(() =>
  import('@/pages/BloodManagement').then(m => ({ default: m.BloodManagement })),
)
export const BedsManagement = lazy(() =>
  import('@/pages/BedsManagement').then(m => ({ default: m.BedsManagement })),
)
export const AmbulancesManagement = lazy(() =>
  import('@/pages/AmbulancesManagement').then(m => ({ default: m.AmbulancesManagement })),
)
export const MLPredictions = lazy(() =>
  import('@/pages/MLPredictions').then(m => ({ default: m.MLPredictions })),
)
export const FacilitiesManagement = lazy(() =>
  import('@/pages/FacilitiesManagement').then(m => ({ default: m.FacilitiesManagement })),
)
export const Profile = lazy(() => import('@/pages/Profile').then(m => ({ default: m.Profile })))
export const Login = lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })))
export const NotFound = lazy(() => import('@/pages/NotFound').then(m => ({ default: m.NotFound })))
