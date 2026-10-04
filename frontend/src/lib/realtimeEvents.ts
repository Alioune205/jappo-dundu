/**
 * Noms des événements temps réel émis par le backend (champ `data.event`,
 * ou type du message à défaut). Source : ambulances/services.py,
 * lits/services.py, sang/notifications.py, realtime/broadcast.py.
 */
export const RealtimeEvent = {
  missionCreated: 'mission_created',
  missionUpdated: 'mission_updated',
  ambulancePosition: 'ambulance_position',
  ambulanceStatus: 'ambulance_status',
  bedCapacityUpdated: 'bed_capacity_updated',
  bedCapacitySaturated: 'bed_capacity_saturated',
  bedCapacityRestored: 'bed_capacity_restored',
  bloodRequestCreated: 'blood_request_created',
  bloodRequestUpdated: 'blood_request_updated',
  bloodRequestClosed: 'blood_request_closed',
  bloodResponseUpdated: 'blood_response_updated',
  predictionUpdate: 'prediction_update',
} as const

export const MISSION_EVENTS = [RealtimeEvent.missionCreated, RealtimeEvent.missionUpdated]

export const BED_EVENTS = [
  RealtimeEvent.bedCapacityUpdated,
  RealtimeEvent.bedCapacitySaturated,
  RealtimeEvent.bedCapacityRestored,
]

export const BLOOD_REQUEST_EVENTS = [
  RealtimeEvent.bloodRequestCreated,
  RealtimeEvent.bloodRequestUpdated,
  RealtimeEvent.bloodRequestClosed,
]
