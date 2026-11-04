import React, { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Lightbulb } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/format'
import { useAuth } from '@/context/AuthContext'
import { canManage } from '@/lib/access'

interface Recommendation {
  region: string
  region_display: string
  blood_group: string
  risk_level: 'CRITICAL' | 'WARNING'
  first_date: string
  days_until: number
  days_of_supply: number | null
  reason: string
  actions: { type: 'campaign' | 'drive' | 'transfer'; label: string }[]
}

/**
 * Des prévisions aux actions : pour chaque risque des 14 prochains jours, la
 * raison et ce qu'on peut faire maintenant (prévenir les donneurs, organiser
 * une collecte, demander un transfert). L'administrateur général voit les
 * risques et leurs raisons, sans les boutons d'action (supervision).
 */
export const RecommendationsPanel: React.FC = () => {
  const { data: items = [] } = useQuery<Recommendation[]>({
    queryKey: ['ml-recommendations'],
    queryFn: () => api.get<Recommendation[]>('/api/ml/recommendations/'),
  })
  if (items.length === 0) return null

  return (
    <section className="panel">
      <div className="border-b border-line px-5 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Lightbulb className="h-4 w-4 text-warning" aria-hidden="true" />
          Actions recommandées
        </h2>
        <p className="text-xs text-muted">Risques des 14 prochains jours : agir avant la pénurie.</p>
      </div>
      <ul className="divide-y divide-line">
        {items.slice(0, 6).map((item) => (
          <RecommendationRow key={`${item.region}-${item.blood_group}`} item={item} />
        ))}
      </ul>
    </section>
  )
}

const RecommendationRow: React.FC<{ item: Recommendation }> = ({ item }) => {
  const [sent, setSent] = useState<number | null>(null)
  const { roles } = useAuth()
  const operates = canManage(roles, 'blood')
  const campaign = useMutation({
    mutationFn: () =>
      api.post<{ notified_donors: number }>('/api/sang/campaigns/', {
        region: item.region,
        blood_group: item.blood_group,
      }),
    onSuccess: (data) => setSent(data.notified_donors),
  })
  return (
    <li className="space-y-2 px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-base font-bold text-fg">{item.blood_group}</span>
        <span className="text-sm text-fg">{item.region_display}</span>
        <Badge tone={item.risk_level === 'CRITICAL' ? 'danger' : 'warning'} size="sm">
          {item.risk_level === 'CRITICAL' ? 'Critique' : 'Vigilance'}
        </Badge>
        <span className="text-xs text-muted">
          dès le {formatDate(item.first_date)} (dans {item.days_until} j)
          {item.days_of_supply !== null && ` · ${item.days_of_supply} j de réserve`}
        </span>
      </div>
      <p className="text-xs text-muted">{item.reason}</p>
      {operates && (
      <div className="flex flex-wrap gap-2">
        {item.actions.map((action) =>
          action.type === 'campaign' ? (
            sent !== null ? (
              <span key={action.type} className="text-xs font-semibold text-ok">
                {sent} donneur{sent > 1 ? 's' : ''} prévenu{sent > 1 ? 's' : ''}
              </span>
            ) : (
              <Button
                key={action.type}
                size="sm"
                variant="primary"
                isLoading={campaign.isPending}
                onClick={() => campaign.mutate()}
              >
                {action.label}
              </Button>
            )
          ) : (
            <Link
              key={action.type}
              to="/blood"
              className="inline-flex h-8 items-center rounded-md border border-line px-3 text-xs font-medium text-fg hover:bg-raised"
            >
              {action.label}
            </Link>
          )
        )}
      </div>
      )}
      {campaign.error && (
        <p role="alert" className="text-xs text-critical">
          {campaign.error instanceof Error ? campaign.error.message : 'Campagne impossible.'}
        </p>
      )}
    </li>
  )
}
