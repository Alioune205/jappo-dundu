import React from 'react'
import { Badge } from '@/components/ui/Badge'
import { Input, Select } from '@/components/ui/Input'
import { Skeleton, EmptyState } from '@/components/ui/Skeleton'
import { ROLES, labelOf } from '@/lib/constants'
import { formatDateTime } from '@/lib/format'
import type { AdminUser } from '@/types/api'

interface UsersTableProps {
  users: AdminUser[]
  isLoading: boolean
  search: string
  onSearchChange: (value: string) => void
  role: string
  onRoleChange: (value: string) => void
}

/** Onglet « Comptes » : recherche, filtre par rôle et tableau. */
export const UsersTable: React.FC<UsersTableProps> = ({ users, isLoading, search, onSearchChange, role, onRoleChange }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-2/3">
      <Input
        label="Recherche"
        type="search"
        placeholder="Nom, identifiant ou téléphone…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <Select label="Rôle" value={role} onChange={(e) => onRoleChange(e.target.value)}>
        <option value="">Tous</option>
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
    </div>

    {isLoading ? (
      <div className="space-y-2 rounded-md border border-line bg-surface p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    ) : users.length === 0 ? (
      <EmptyState title="Aucun compte" description="Aucun compte ne correspond à cette recherche." />
    ) : (
      <div className="overflow-hidden rounded-md border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="ops-table">
            <thead>
              <tr>
                <th scope="col">Utilisateur</th>
                <th scope="col">Rôle</th>
                <th scope="col">Établissement</th>
                <th scope="col">Téléphone</th>
                <th scope="col">Créé le</th>
                <th scope="col">État</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="whitespace-nowrap">
                    <div className="font-medium text-fg">{u.full_name || u.username}</div>
                    <div className="num text-2xs text-muted">{u.username}</div>
                  </td>
                  <td className="whitespace-nowrap text-fg">{labelOf(ROLES, u.role)}</td>
                  <td className="w-full max-w-0">
                    <div className="truncate text-muted">{u.facility ? u.facility.name : '—'}</div>
                  </td>
                  <td className="num whitespace-nowrap text-muted">{u.phone_number || '—'}</td>
                  <td className="num whitespace-nowrap text-xs text-muted">{formatDateTime(u.date_joined)}</td>
                  <td>
                    <Badge tone={u.is_active ? 'success' : 'neutral'} size="sm">
                      {u.is_active ? 'Actif' : 'Bloqué'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
)
