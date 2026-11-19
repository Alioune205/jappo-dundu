import React, { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Droplet, Droplets, HeartHandshake, MapPin, Plus, TrendingDown } from 'lucide-react'
import { Link } from 'react-router'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/ui/PageHeader'
import { MetricTile } from '@/components/dash/MetricTile'
import { EmptyNote, Panel } from '@/components/dash/Panel'
import { CoverageBars } from '@/components/dash/CoverageBars'
import { UnitCells } from '@/components/dash/UnitCells'
import { UrgentCard, type UrgentItem } from '@/components/dash/UrgentCard'
import { BLOOD_GROUPS } from '@/lib/constants'
import { useNow } from '@/lib/useNow'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { BLOOD_REQUEST_EVENTS, RealtimeEvent } from '@/lib/realtimeEvents'
import { formatNumber, formatPercent, formatRelative } from '@/lib/format'
import { QK } from '@/lib/queryKeys'
import type { BloodRequest, FacilitySummary } from '@/types/api'
import { groupLabel, plural } from './shared'
import { StockCard } from './StockCard'
import { OUTLOOK_DAYS, stockCapsules, useStockOutlook } from './stockOutlook'

const URGENCY_RANK = { critical: 0, urgent: 1, normal: 2 } as const

/**
 * Tableau de bord de l'administrateur du sang : quatre chiffres, puis une
 * seule rangée — réserves par groupe, la demande à traiter en premier, et la
 * couverture des demandes. La liste complète des demandes vit dans le module
 * Banque de sang.
 */
export const BloodManagerDashboard: React.FC<{ facility: FacilitySummary }> = ({ facility }) => {
  const now = useNow()

  // 1. Demandes ouvertes (périmètre fixé par le serveur)
  const { data: requests = [], isPending: requestsPending } = useQuery<BloodRequest[]>({
    queryKey: [...QK.bloodRequests, 'open'],
    queryFn: async () =>
      (await api.get<{ results: BloodRequest[] }>('/api/sang/requests/', { status: 'open' })).results || [],
  })

  // 2. Réserves de la région et pénuries prévues
  const stock = useStockOutlook(facility.region, now)

  useRealtimeRefresh([
    { events: BLOOD_REQUEST_EVENTS, queryKeys: [QK.bloodRequests] },
    { events: [RealtimeEvent.predictionUpdate], queryKeys: [QK.mlPredictionsList] },
  ])

  const open = useMemo(
    () =>
      [...requests].sort(
        (a, b) =>
          URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
          (a.needed_by ?? '9999').localeCompare(b.needed_by ?? '9999')
      ),
    [requests]
  )
  const vital = open.filter((r) => r.urgency === 'critical')
  const urgentReqs = open.filter((r) => r.urgency === 'urgent')
  const normalReqs = open.filter((r) => r.urgency === 'normal')
  const missingUnits = open.reduce((acc, r) => acc + r.units_remaining, 0)
  const collectedUnits = open.reduce((acc, r) => acc + r.units_collected, 0)
  const neededUnits = open.reduce((acc, r) => acc + r.units_needed, 0)
  const donorsComing = open.reduce((acc, r) => acc + (r.response_counts?.accepted ?? 0), 0)

  const capsules = useMemo(
    () => stockCapsules(stock.outlook, stock.stockScale, open),
    [stock.outlook, stock.stockScale, open]
  )

  // Le point à traiter en premier : la demande la plus urgente, puis la plus proche de son échéance.
  const top = open[0]
  const urgent: UrgentItem | null = top
    ? {
        severity: top.urgency === 'critical' ? 'critical' : 'warning',
        tag: top.urgency === 'critical' ? 'Demande vitale' : top.urgency === 'urgent' ? 'Demande urgente' : 'Demande ouverte',
        heading: top.facility?.name ?? 'Établissement',
        big: plural(top.units_remaining, 'poche', 'poches'),
        bigNote: `de sang ${groupLabel(top.blood_group)} à trouver`,
        meta: `Demandée ${formatRelative(top.created_at, now)} · ${plural(top.response_counts?.accepted ?? 0, 'donneur')} en route`,
        progress: {
          done: top.units_collected,
          total: top.units_needed,
          left: `${formatNumber(top.units_collected)} reçue${top.units_collected > 1 ? 's' : ''} sur ${formatNumber(top.units_needed)}`,
          right: `${formatNumber(top.units_remaining)} manquante${top.units_remaining > 1 ? 's' : ''}`,
        },
        action: { to: '/blood', label: 'Voir la demande' },
      }
    : null

  // Couverture par urgence : poches réunies sur poches demandées.
  const coverage = neededUnits > 0 ? collectedUnits / neededUnits : null
  const coverageRows = (
    [
      ['critical', 'Vitales', vital, 'bg-viz-crit'],
      ['urgent', 'Urgentes', urgentReqs, 'bg-viz-warn'],
      ['normal', 'Normales', normalReqs, 'bg-viz-base'],
    ] as const
  ).map(([key, label, list, fillClass]) => ({
    key,
    label,
    count: plural(list.length, 'demande'),
    got: list.reduce((acc, r) => acc + r.units_collected, 0),
    need: list.reduce((acc, r) => acc + r.units_needed, 0),
    fillClass,
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <span>Jappo Sang</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Région de {facility.region_display}
            </span>
          </>
        }
        title={facility.name}
        description="Demandes en cours, réserves par groupe et pénuries prévues de votre région."
        actions={
          <Link
            to="/blood"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-strong"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle demande
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 xl:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))]">
        {/* La tuile qui tient l'écran : ce qui manque, poche par poche. */}
        <MetricTile
          i={0}
          variant="featured"
          className="sm:col-span-3 xl:col-span-1"
          icon={Droplet}
          to="/blood"
          label="Poches manquantes"
          loading={requestsPending}
          value={missingUnits}
          unit={neededUnits > 0 ? `sur ${formatNumber(neededUnits)} demandées` : undefined}
          badge={vital.length > 0 ? { label: plural(vital.length, 'demande vitale', 'demandes vitales'), signal: 'critical' } : undefined}
          status={{ text: `${formatNumber(collectedUnits)} collectées`, signal: 'ok' }}
          hint="Une cellule = une poche"
        >
          {neededUnits > 0 && (
            <UnitCells
              tone="dark"
              total={neededUnits}
              filled={collectedUnits}
              label={`${formatNumber(collectedUnits)} poches collectées sur ${formatNumber(neededUnits)} demandées`}
            />
          )}
        </MetricTile>
        <MetricTile
          i={1}
          icon={Droplets}
          accent="red"
          to="/blood"
          label="Demandes ouvertes"
          loading={requestsPending}
          value={open.length}
          status={
            vital.length > 0
              ? { text: 'Urgence vitale en cours', signal: 'critical' }
              : { text: 'Aucune urgence vitale', signal: 'ok' }
          }
          hint={`${urgentReqs.length} urgente${urgentReqs.length > 1 ? 's' : ''} · ${normalReqs.length} normale${normalReqs.length > 1 ? 's' : ''}`}
        />
        <MetricTile
          i={2}
          icon={HeartHandshake}
          accent="green"
          label="Donneurs en route"
          loading={requestsPending}
          value={donorsComing}
          status={
            donorsComing > 0
              ? { text: 'Ont accepté de venir', signal: 'ok' }
              : { text: 'Aucun donneur annoncé', signal: 'neutral' }
          }
          hint="Réponses aux alertes"
        />
        <MetricTile
          i={3}
          icon={TrendingDown}
          accent="violet"
          to="/ml"
          label="Groupes en pénurie"
          value={stock.criticalGroups.length}
          unit={`/ ${BLOOD_GROUPS.length}`}
          status={{
            text: `Prévision à ${OUTLOOK_DAYS} jours`,
            signal: stock.criticalGroups.length > 0 ? 'critical' : 'ok',
          }}
          hint={
            stock.criticalGroups.length > 0
              ? `Critique : ${stock.criticalGroups.map(groupLabel).join(', ')}`
              : 'Aucune pénurie annoncée'
          }
        />
      </div>

      {/* Une seule rangée : les réserves, la demande à traiter, la couverture. */}
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <StockCard
          i={4}
          scope="dans la région"
          pending={stock.stocksPending}
          hasStock={stock.hasStock}
          capsules={capsules}
          scale={stock.stockScale}
          latestDate={stock.latestDate}
          simulated={stock.simulated}
        />

        <UrgentCard
          i={5}
          loading={requestsPending}
          item={urgent}
          more={{ count: Math.max(0, open.length - 1), to: '/blood' }}
          calm="Toutes les demandes de votre périmètre sont satisfaites."
        />

        <Panel
          i={6}
          title="Couverture des demandes"
          subtitle="Poches collectées sur poches demandées"
          actions={
            <Badge tone={vital.length > 0 ? 'danger' : 'success'} size="sm">
              {vital.length > 0 ? 'Priorité vitale' : 'Nominal'}
            </Badge>
          }
          bodyClassName="flex flex-col px-5 pb-5 pt-3"
        >
          {open.length === 0 ? (
            <EmptyNote tone="calm" title="Aucune demande ouverte" hint="Rien à couvrir pour le moment." />
          ) : (
            <>
              <p className="flex items-baseline gap-3">
                <span className="num text-[2.75rem] font-extrabold leading-none tracking-[-0.04em] text-fg">
                  {formatPercent(coverage)}
                </span>
                <span className="text-sm text-muted">des poches demandées sont réunies</span>
              </p>
              <div className="mt-5">
                <CoverageBars rows={coverageRows.filter((r) => r.need > 0)} unit="poches" />
              </div>
              {missingUnits > 0 && (
                <p className="mt-4 text-xs text-muted">
                  <span className="num font-semibold text-fg">{formatNumber(missingUnits)} poches</span> restent à trouver.
                </p>
              )}
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}
