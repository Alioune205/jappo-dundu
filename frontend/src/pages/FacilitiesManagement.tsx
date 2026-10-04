import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs } from '@/components/ui/Tabs'
import type { AdminUser, Facility } from '@/types/api'
import { FacilitiesTable } from './facilities/FacilitiesTable'
import { UsersTable } from './facilities/UsersTable'
import { FacilityFormModal } from './facilities/FacilityFormModal'
import { UserFormModal } from './facilities/UserFormModal'
import { QK } from '@/lib/queryKeys'

type Tab = 'facilities' | 'users'

/** Page « Structures et comptes » (administration). */
export const FacilitiesManagement: React.FC = () => {
  const { isAdmin } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('facilities')
  const [openModal, setOpenModal] = useState<Tab | null>(null)

  const [facilityRegion, setFacilityRegion] = useState('')
  const [facilityType, setFacilityType] = useState('')
  const [userRole, setUserRole] = useState('')
  const [userSearch, setUserSearch] = useState('')
  // La recherche ne part qu'après une courte pause de frappe.
  const debouncedSearch = useDebouncedValue(userSearch.trim())

  const facilitiesQuery = useQuery<Facility[]>({
    queryKey: [...QK.adminFacilities, facilityRegion, facilityType],
    queryFn: async () =>
      (
        await api.get<{ results: Facility[] }>('/api/facilities/', {
          region: facilityRegion || undefined,
          facility_type: facilityType || undefined,
        })
      ).results || [],
  })

  const usersQuery = useQuery<AdminUser[]>({
    queryKey: [...QK.adminUsers, userRole, debouncedSearch],
    queryFn: async () =>
      (
        await api.get<{ results: AdminUser[] }>('/api/users/', {
          role: userRole || undefined,
          search: debouncedSearch || undefined,
        })
      ).results || [],
  })

  const activeQuery = activeTab === 'facilities' ? facilitiesQuery : usersQuery

  return (
    <div className="space-y-5">
      <PageHeader
        title="Structures et comptes"
        description="Établissements de santé du réseau et comptes du personnel habilité."
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => activeQuery.refetch()}
              isLoading={activeQuery.isRefetching}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Actualiser
            </Button>
            {isAdmin && (
              <Button variant="primary" size="sm" onClick={() => setOpenModal(activeTab)} icon={<Plus className="h-3.5 w-3.5" />}>
                {activeTab === 'facilities' ? 'Nouvel établissement' : 'Nouveau compte'}
              </Button>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: 'facilities', label: 'Établissements', count: facilitiesQuery.data?.length ?? 0 },
          { id: 'users', label: 'Comptes', count: usersQuery.data?.length ?? 0 },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'facilities' ? (
        <FacilitiesTable
          facilities={facilitiesQuery.data ?? []}
          isLoading={facilitiesQuery.isLoading}
          region={facilityRegion}
          onRegionChange={setFacilityRegion}
          type={facilityType}
          onTypeChange={setFacilityType}
        />
      ) : (
        <UsersTable
          users={usersQuery.data ?? []}
          isLoading={usersQuery.isLoading}
          search={userSearch}
          onSearchChange={setUserSearch}
          role={userRole}
          onRoleChange={setUserRole}
        />
      )}

      <FacilityFormModal isOpen={openModal === 'facilities'} onClose={() => setOpenModal(null)} />
      <UserFormModal isOpen={openModal === 'users'} onClose={() => setOpenModal(null)} />
    </div>
  )
}
