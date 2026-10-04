/** Règles métier pures de la page « Flotte SAMU » (testées dans missionUtils.test.ts). */
import type { Mission, MissionStatus } from '@/types/api'

/** Délai d'arrivée sur place visé (minutes). */
export const RESPONSE_TARGET_MINUTES = 20

/** Étape suivante du cycle de vie d'une mission déjà affectée. */
export const NEXT_STEP: Partial<Record<MissionStatus, { status: MissionStatus; label: string }>> = {
  assigned: { status: 'on_site', label: 'Sur place' },
  on_site: { status: 'transporting', label: 'Début transport' },
  transporting: { status: 'completed', label: 'Terminer' },
}

export function isActiveMission(mission: Pick<Mission, 'status'>): boolean {
  return mission.status !== 'completed' && mission.status !== 'cancelled'
}

/** Liseré de ligne : seules les missions en cours sont signalées. */
export function missionSeverity(mission: Pick<Mission, 'status' | 'priority'>): 'critical' | 'warning' | undefined {
  if (!isActiveMission(mission)) return undefined
  if (mission.priority === 'critical') return 'critical'
  if (mission.priority === 'urgent') return 'warning'
  return undefined
}

/** Libellé de tendance du délai moyen d'arrivée (undefined sans données). */
export function responseTrend(averageMinutes: number | null): string | undefined {
  if (averageMinutes == null) return undefined
  return averageMinutes <= RESPONSE_TARGET_MINUTES
    ? `Objectif ${RESPONSE_TARGET_MINUTES} min tenu`
    : `Au-delà de ${RESPONSE_TARGET_MINUTES} min`
}
