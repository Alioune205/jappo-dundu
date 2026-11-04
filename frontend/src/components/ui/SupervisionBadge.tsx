import React from 'react'
import { Eye } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { isSupervisor } from '@/lib/access'
import { Badge } from './Badge'

/**
 * Badge discret des modules métier (sang, lits, ambulances, tableau de bord)
 * pour l'administrateur général : il consulte tout mais n'effectue aucune
 * opération (le backend refuse ses écritures en 403). Rien pour les autres rôles.
 */
export const SupervisionBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { roles } = useAuth()
  if (!isSupervisor(roles)) return null
  return (
    <Badge
      tone="neutral"
      size="sm"
      dot={false}
      className={className}
      title="L'administrateur général supervise : consultation de toutes les données nationales, sans opérations métier."
    >
      <Eye className="h-3 w-3" aria-hidden="true" />
      Lecture seule — supervision nationale
    </Badge>
  )
}
