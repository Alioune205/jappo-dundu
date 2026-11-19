import React from 'react'
import { EmptyNote, Legend, LegendItem, Panel } from '@/components/dash/Panel'
import { CapsuleChart, type CapsuleDatum } from '@/components/dash/CapsuleChart'
import { SIGNAL_FILL } from '@/components/dash/tones'
import { BLOOD_GROUPS } from '@/lib/constants'
import { formatShortDate } from '@/lib/format'
import { OUTLOOK_DAYS } from './stockOutlook'

interface StockCardProps {
  i?: number
  className?: string
  /** Périmètre du relevé (« dans la région », « sur tout le réseau »). */
  scope: string
  pending: boolean
  hasStock: boolean
  capsules: CapsuleDatum[]
  scale: number
  latestDate: string | null
  simulated: boolean
}

/**
 * Stock de sang par groupe : une capsule par groupe, sa hauteur dit la
 * réserve, sa couleur le risque prévu à sept jours. Même carte pour
 * l'administrateur général (réseau) et l'administrateur du sang (région).
 */
export const StockCard: React.FC<StockCardProps> = ({
  i = 0,
  className = '',
  scope,
  pending,
  hasStock,
  capsules,
  scale,
  latestDate,
  simulated,
}) => (
  <Panel
    i={i}
    className={className}
    title="Stock de sang par groupe"
    subtitle={
      <>
        {latestDate ? `Relevé du ${formatShortDate(latestDate)}` : 'Aucun relevé récent'} · poches {scope}
        {simulated ? ' · données simulées' : ''}
      </>
    }
    footer={
      hasStock && (
        <Legend>
          <LegendItem className={SIGNAL_FILL.ok}>Stable</LegendItem>
          <LegendItem className={SIGNAL_FILL.warning}>Vigilance</LegendItem>
          <LegendItem className={SIGNAL_FILL.critical}>Critique à {OUTLOOK_DAYS} j</LegendItem>
          <LegendItem kind="dashed">Pas de relevé</LegendItem>
        </Legend>
      )
    }
    bodyClassName="px-5 pb-4 pt-10"
  >
    {pending ? (
      <div className="flex h-[13rem] items-end gap-3" aria-label="Chargement">
        {BLOOD_GROUPS.map((g, k) => (
          <span key={g} className="skeleton block flex-1 rounded-full" style={{ height: `${35 + ((k * 23) % 50)}%` }} />
        ))}
      </div>
    ) : !hasStock ? (
      <EmptyNote
        className="min-h-[13rem]"
        title="Aucun relevé de stock récent"
        hint="Les réserves apparaîtront dès que les centres transmettront leur relevé quotidien."
      />
    ) : (
      <CapsuleChart
        mode="fill"
        hatch
        capsuleWidth={34}
        data={capsules}
        height={190}
        ariaLabel={`Réserves par groupe sanguin, poches ${scope}`}
      />
    )}
    {hasStock && <p className="sr-only">Capsule pleine = {scale} poches</p>}
  </Panel>
)
